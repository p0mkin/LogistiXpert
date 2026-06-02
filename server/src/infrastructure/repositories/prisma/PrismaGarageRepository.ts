import { PrismaClient, Prisma } from '@prisma/client';
import { IGarageRepository } from '../IGarageRepository';
import { GarageAggregate } from '../../../domain/aggregates/Garage';

export class PrismaGarageRepository implements IGarageRepository {
  constructor(private readonly client: Prisma.TransactionClient | PrismaClient) {}

  public async getById(id: string): Promise<GarageAggregate | null> {
    const raw = await this.client.garage.findUnique({
      where: { id },
    });
    return raw ? new GarageAggregate(raw) : null;
  }

  public async save(garage: GarageAggregate): Promise<void> {
    await this.client.garage.update({
      where: { id: garage.id },
      data: {
        dieselStorage: garage.state.dieselStorage,
        electricityStorage: garage.state.electricityStorage,
        adblueStorage: garage.state.adblueStorage,
        co2Allowances: garage.state.co2Allowances,
        upgradeLevel: garage.state.upgradeLevel,
        terminalLevel: garage.state.terminalLevel,
        contrabandStorageA: garage.state.contrabandStorageA,
        contrabandStorageB: garage.state.contrabandStorageB,
        contrabandStorageC: garage.state.contrabandStorageC,
      },
    });
  }
}
