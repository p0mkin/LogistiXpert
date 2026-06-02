import { PrismaClient, CargoType, ContrabandClass } from '@prisma/client';
import { GameWebSocketServer } from '../websocket';

const prisma = new PrismaClient();

export class ClanService {
  /**
   * Generates a high-volume joint clan contract and publishes it on the clan board
   */
  static async publishClanContract(
    clanId: string,
    data: {
      title: string;
      cargoType?: CargoType;
      cargoClass?: ContrabandClass;
      origin: string;
      destination: string;
      distanceKm: number;
      totalVolume: number;
      payoutLegal: number;
      payoutBlack: number;
    }
  ) {
    const contract = await prisma.clanContract.create({
      data: {
        title: data.title,
        cargoType: data.cargoType || null,
        cargoClass: data.cargoClass || null,
        origin: data.origin,
        destination: data.destination,
        distanceKm: data.distanceKm,
        totalVolume: data.totalVolume,
        volumeDelivered: 0.0,
        payoutLegal: data.payoutLegal,
        payoutBlack: data.payoutBlack,
        clanId,
        status: 'ACTIVE',
      },
    });

    // Notify all clan companies
    GameWebSocketServer.broadcastToClan(clanId, 'clan:contract_published', {
      contractId: contract.id,
      title: contract.title,
      origin: contract.origin,
      destination: contract.destination,
      totalVolume: contract.totalVolume,
      payoutLegal: parseFloat(Number(contract.payoutLegal).toFixed(2)),
      payoutBlack: parseFloat(Number(contract.payoutBlack).toFixed(2)),
      message: `NEW CLAN CONTRACT: "${contract.title}" has been published to the Clan Board!`,
    });

    return contract;
  }

  /**
   * Records a completed delivery portion of a clan contract from a sibling company
   */
  static async recordContribution(clanContractId: string, companyId: string, volume: number, tx?: any) {
    const client = tx || prisma;
    const contract = await client.clanContract.findUnique({
      where: { id: clanContractId },
      include: { clan: true, contributions: true },
    });

    if (!contract || contract.status !== 'ACTIVE') {
      throw new Error('Clan contract not found or is no longer active.');
    }

    const newVolumeDelivered = Math.min(contract.volumeDelivered + volume, contract.totalVolume);
    const actualVolumeAdded = newVolumeDelivered - contract.volumeDelivered;

    if (actualVolumeAdded <= 0) {
      return contract;
    }

    // Upsert contribution record
    await client.clanContractContribution.upsert({
      where: {
        clanContractId_companyId: { clanContractId, companyId },
      },
      update: {
        volumeDelivered: { increment: actualVolumeAdded },
      },
      create: {
        clanContractId,
        companyId,
        volumeDelivered: actualVolumeAdded,
      },
    });

    // Update contract overall delivered volume
    const updatedContract = await client.clanContract.update({
      where: { id: clanContractId },
      data: {
        volumeDelivered: newVolumeDelivered,
        status: newVolumeDelivered >= contract.totalVolume ? 'COMPLETED' : 'ACTIVE',
      },
      include: {
        contributions: true,
        clan: true,
      },
    });

    // Notify clan about contribution
    GameWebSocketServer.broadcastToClan(contract.clanId, 'clan:contract_progress', {
      contractId: contract.id,
      title: contract.title,
      volumeDelivered: newVolumeDelivered,
      totalVolume: contract.totalVolume,
      addedVolume: actualVolumeAdded,
      companyId,
      message: `CLAN PROGRESS: Company delivered ${actualVolumeAdded.toFixed(1)} units of ${contract.title}. (${newVolumeDelivered.toFixed(1)}/${contract.totalVolume.toFixed(1)} completed)`,
    });

    // If fully completed, trigger mathematical revenue splits
    if (newVolumeDelivered >= contract.totalVolume) {
      await this.settleClanContract(updatedContract.id, tx);
    }

    return updatedContract;
  }

  /**
   * Distributes clean legal and/or black market cash proportionately among contributors, applying optional clan tax
   */
  static async settleClanContract(contractId: string, tx?: any) {
    const client = tx || prisma;
    const contract = await client.clanContract.findUnique({
      where: { id: contractId },
      include: { contributions: true, clan: true },
    });

    if (!contract || contract.status !== 'COMPLETED') return;

    const totalPayoutLegal = Number(contract.payoutLegal);
    const totalPayoutBlack = Number(contract.payoutBlack);
    const totalVolume = contract.totalVolume;

    // Clan Tax (5% hardcoded or configurable, let's use 5% as default)
    const clanTaxPct = 0.05;
    const taxLegal = totalPayoutLegal * clanTaxPct;
    const taxBlack = totalPayoutBlack * clanTaxPct;

    const netPayoutLegal = totalPayoutLegal - taxLegal;
    const netPayoutBlack = totalPayoutBlack - taxBlack;

    const runSettle = async (transactionalClient: any) => {
      // 1. Credit Clan Treasury
      await transactionalClient.clan.update({
        where: { id: contract.clanId },
        data: {
          treasury: { increment: taxLegal + taxBlack }, // Treasury accepts both or sum as cash (legal focus)
          reputation: { increment: 25 }, // Clan reputation boost
        },
      });

      // 2. Distribute net proceeds proportionally to sibling companies
      for (const contribution of contract.contributions) {
        const ratio = contribution.volumeDelivered / totalVolume;
        const companyLegalShare = netPayoutLegal * ratio;
        const companyBlackShare = netPayoutBlack * ratio;

        await transactionalClient.company.update({
          where: { id: contribution.companyId },
          data: {
            legalBalance: { increment: companyLegalShare },
            blackMarketBalance: { increment: companyBlackShare },
            reputationScore: { increment: Math.round(15 * ratio) }, // Individual company reputation
          },
        });

        // Trigger balance and notification triggers for the company members
        GameWebSocketServer.sendToCompany(contribution.companyId, 'clan:contract_settled_company', {
          contractId,
          title: contract.title,
          shareLegal: parseFloat(companyLegalShare.toFixed(2)),
          shareBlack: parseFloat(companyBlackShare.toFixed(2)),
          ratio: parseFloat((ratio * 100).toFixed(1)),
          message: `JOINT DELIVERY SETTLED: Your company received $${companyLegalShare.toFixed(2)} Clean and $${companyBlackShare.toFixed(2)} Dirty cash for contributing ${contribution.volumeDelivered.toFixed(1)} units (${(ratio * 100).toFixed(1)}%) of "${contract.title}".`,
        });
      }
    };

    if (tx) {
      await runSettle(tx);
    } else {
      await prisma.$transaction(async (newTx) => {
        await runSettle(newTx);
      });
    }

    // Notify whole clan of final settlement
    GameWebSocketServer.broadcastToClan(contract.clanId, 'clan:contract_completed', {
      contractId,
      title: contract.title,
      taxLegalCollected: parseFloat(taxLegal.toFixed(2)),
      taxBlackCollected: parseFloat(taxBlack.toFixed(2)),
      message: `CELEBRATION: Joint contract "${contract.title}" is COMPLETED! Clan Treasury collected $${(taxLegal + taxBlack).toFixed(2)} taxes. Contributions settled!`,
    });
  }

  /**
   * Calculates the dynamic maximum company capacity of a Clan based on reputation and treasury
   */
  static async calculateMaxClanCompanies(clanId: string): Promise<number> {
    const clan = await prisma.clan.findUnique({
      where: { id: clanId },
    });

    if (!clan) return 5;

    // Formula: 5 + floor(reputation / 100) + floor(treasury / 100,000)
    const repBonus = Math.floor(clan.reputation / 100);
    const treasuryBonus = Math.floor(Number(clan.treasury) / 100000.0);

    return 5 + repBonus + treasuryBonus;
  }
}
