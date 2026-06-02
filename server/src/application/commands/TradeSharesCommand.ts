import { IUnitOfWork } from '../../infrastructure/persistence/IUnitOfWork';
import { FinanceService } from '../../services/finance.service';
import { GenericDomainEvent } from '../../domain/events/DomainEvents';

export interface TradeSharesDto {
  buyerCompanyId: string;
  targetCompanyId: string;
  action: 'BUY' | 'SELL';
  sharesAmount: number;
}

export interface TradeSharesResult {
  message: string;
  sharesOwned?: number;
  profit?: number;
  taxCharged?: number;
  netProceeds?: number;
  holdingPeriod?: 'SHORT_TERM_DAY_TRADE' | 'LONG_TERM_STABLE';
}

export class TradeSharesCommandHandler {
  constructor(private readonly uow: IUnitOfWork) {}

  public async handle(dto: TradeSharesDto): Promise<TradeSharesResult> {
    return await this.uow.run(async (txUow) => {
      // 1. Fetch aggregates securely inside transaction
      const buyer = await txUow.companyRepository.getById(dto.buyerCompanyId);
      if (!buyer) {
        throw new Error('BUYER_COMPANY_NOT_FOUND');
      }

      const targetRaw = await txUow.rawClient.company.findUnique({
        where: { id: dto.targetCompanyId },
      });
      if (!targetRaw) {
        throw new Error('TARGET_COMPANY_NOT_FOUND');
      }

      if (!targetRaw.isPublic) {
        throw new Error('TARGET_NOT_PUBLIC');
      }

      // 2. Fetch target valuation inside transaction context
      const targetValuation = await FinanceService.calculateCompanyValuation(dto.targetCompanyId, txUow.rawClient);
      const sharePrice = targetValuation / targetRaw.totalShares;
      const totalCost = sharePrice * dto.sharesAmount;

      const existingHolding = await txUow.rawClient.companyShare.findUnique({
        where: {
          companyId_ownerCompanyId: {
            companyId: dto.targetCompanyId,
            ownerCompanyId: dto.buyerCompanyId,
          },
        },
      });

      if (dto.action.toUpperCase() === 'BUY') {
        const currentSharesOwned = existingHolding ? existingHolding.shares : 0;
        const newSharesOwned = currentSharesOwned + dto.sharesAmount;

        // 3. Perform stock cost validation and domain state transitions
        const { finalCost } = buyer.calculateStockPurchaseCost(
          {
            isPublic: targetRaw.isPublic,
            totalShares: targetRaw.totalShares,
            clanId: targetRaw.clanId,
            valuation: targetValuation,
          },
          dto.sharesAmount,
          currentSharesOwned
        );

        buyer.buyShares(finalCost);

        // 4. Persist states
        await txUow.companyRepository.save(buyer);

        await txUow.rawClient.companyShare.upsert({
          where: {
            companyId_ownerCompanyId: {
              companyId: dto.targetCompanyId,
              ownerCompanyId: dto.buyerCompanyId,
            },
          },
          update: {
            shares: { increment: dto.sharesAmount },
            avgPurchasePrice: existingHolding
              ? (Number(existingHolding.avgPurchasePrice) * currentSharesOwned + totalCost) / newSharesOwned
              : sharePrice,
            purchasedAt: new Date(),
          },
          create: {
            companyId: dto.targetCompanyId,
            ownerCompanyId: dto.buyerCompanyId,
            shares: dto.sharesAmount,
            avgPurchasePrice: sharePrice,
            purchasedAt: new Date(),
          },
        });

        // 5. Register Domain Event to update client balance after commit
        txUow.addDomainEvent(
          new GenericDomainEvent(buyer.id, 'company:balance_update', {
            legalBalance: parseFloat(buyer.legalBalance.toFixed(2)),
            blackMarketBalance: parseFloat(buyer.blackMarketBalance.toFixed(2)),
            message: `SUCCESS: Purchased ${dto.sharesAmount} shares of ${targetRaw.name} at $${sharePrice.toFixed(4)}/share.`,
          })
        );

        return {
          message: `SUCCESS: Purchased ${dto.sharesAmount} shares of ${targetRaw.name} at $${sharePrice.toFixed(4)}/share.`,
          sharesOwned: newSharesOwned,
        };

      } else if (dto.action.toUpperCase() === 'SELL') {
        if (!existingHolding || existingHolding.shares < dto.sharesAmount) {
          throw new Error('INSUFFICIENT_SHARES');
        }

        // 3. Perform stock sale tax and net proceeds domain state transitions
        const { profit, tax, netProceeds, holdsShortTerm } = buyer.calculateCapitalGainsTax(
          existingHolding.purchasedAt,
          dto.sharesAmount,
          Number(existingHolding.avgPurchasePrice),
          sharePrice
        );

        buyer.sellShares(netProceeds);

        // 4. Persist states
        await txUow.companyRepository.save(buyer);

        if (existingHolding.shares === dto.sharesAmount) {
          await txUow.rawClient.companyShare.delete({
            where: { id: existingHolding.id },
          });
        } else {
          await txUow.rawClient.companyShare.update({
            where: { id: existingHolding.id },
            data: { shares: { decrement: dto.sharesAmount } },
          });
        }

        // 5. Register Domain Event to update client balance after commit
        txUow.addDomainEvent(
          new GenericDomainEvent(buyer.id, 'company:balance_update', {
            legalBalance: parseFloat(buyer.legalBalance.toFixed(2)),
            blackMarketBalance: parseFloat(buyer.blackMarketBalance.toFixed(2)),
            message: `SUCCESS: Sold ${dto.sharesAmount} shares of ${targetRaw.name} at $${sharePrice.toFixed(4)}/share.`,
          })
        );

        return {
          message: `SUCCESS: Sold ${dto.sharesAmount} shares of ${targetRaw.name} at $${sharePrice.toFixed(4)}/share.`,
          profit: parseFloat(profit.toFixed(2)),
          taxCharged: parseFloat(tax.toFixed(2)),
          netProceeds: parseFloat(netProceeds.toFixed(2)),
          holdingPeriod: holdsShortTerm ? 'SHORT_TERM_DAY_TRADE' : 'LONG_TERM_STABLE',
        };
      } else {
        throw new Error('INVALID_ACTION');
      }
    });
  }
}
