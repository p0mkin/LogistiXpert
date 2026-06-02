import { PrismaClient, Prisma } from '@prisma/client';
import { IActiveRouteRepository } from '../IActiveRouteRepository';
import { ActiveRouteAggregate } from '../../../domain/aggregates/ActiveRoute';

export class PrismaActiveRouteRepository implements IActiveRouteRepository {
  constructor(private readonly client: Prisma.TransactionClient | PrismaClient) {}

  public async getById(id: string): Promise<ActiveRouteAggregate | null> {
    const raw = await this.client.activeRoute.findUnique({
      where: { id },
      include: {
        driver: true,
        truck: true,
        company: true,
        legalContract: true,
        contrabandJob: true,
        clanContract: true,
      },
    });
    return raw ? new ActiveRouteAggregate(raw as any) : null;
  }

  public async getRoutesForSimulation(): Promise<ActiveRouteAggregate[]> {
    const raws = await this.client.activeRoute.findMany({
      where: { isUnderBorderCheck: false },
      include: {
        driver: true,
        truck: true,
        company: true,
        legalContract: true,
        contrabandJob: true,
        clanContract: true,
      },
    });
    return raws.map((raw) => new ActiveRouteAggregate(raw as any));
  }

  public async getByTruckId(truckId: string): Promise<ActiveRouteAggregate | null> {
    const raw = await this.client.activeRoute.findUnique({
      where: { truckId },
      include: {
        driver: true,
        truck: true,
        company: true,
      },
    });
    return raw ? new ActiveRouteAggregate(raw) : null;
  }

  public async save(route: ActiveRouteAggregate): Promise<void> {
    await this.client.activeRoute.update({
      where: { id: route.id },
      data: {
        progressPct: route.state.progressPct,
        currentCity: route.state.currentCity,
        isUnderBorderCheck: route.state.isUnderBorderCheck,
        isPaused: route.state.isPaused,
        isFerryTransit: route.state.isFerryTransit,
        stage: route.state.stage,
        autopilotPolicy: route.state.autopilotPolicy,
        currentWeather: route.state.currentWeather,
        eta: route.state.eta,
      },
    });

    if (route.state.driver) {
      await this.client.driver.update({
        where: { id: route.state.driver.id },
        data: {
          fatigue: route.state.driver.fatigue,
          tachoHours: route.state.driver.tachoHours,
          isStimulated: route.state.driver.isStimulated,
        },
      });
    }

    if (route.state.truck) {
      await this.client.truck.update({
        where: { id: route.state.truck.id },
        data: {
          engineHealth: route.state.truck.engineHealth,
          tireWear: route.state.truck.tireWear,
          cosmeticHealth: route.state.truck.cosmeticHealth,
          isImpounded: route.state.truck.isImpounded,
          impoundReleaseAt: route.state.truck.impoundReleaseAt,
        },
      });
    }
  }

  public async create(data: {
    companyId: string;
    truckId: string;
    driverId: string;
    legalContractId?: string | null;
    contrabandJobId?: string | null;
    clanContractId?: string | null;
    progressPct?: number;
    eta: Date;
    currentCity: string;
  }): Promise<ActiveRouteAggregate> {
    const raw = await this.client.activeRoute.create({
      data: {
        companyId: data.companyId,
        truckId: data.truckId,
        driverId: data.driverId,
        legalContractId: data.legalContractId,
        contrabandJobId: data.contrabandJobId,
        clanContractId: data.clanContractId,
        progressPct: data.progressPct ?? 0.0,
        eta: data.eta,
        currentCity: data.currentCity,
      },
      include: {
        driver: true,
        truck: true,
        company: true,
      },
    });
    return new ActiveRouteAggregate(raw);
  }

  public async delete(id: string): Promise<void> {
    await this.client.activeRoute.delete({
      where: { id },
    });
  }
}
