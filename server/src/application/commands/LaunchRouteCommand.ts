import { IUnitOfWork } from '../../infrastructure/persistence/IUnitOfWork';
import { RouteDispatchedEvent } from '../../domain/events/DomainEvents';
import { AnalyticsService } from '../../services/analytics.service';

export interface LaunchRouteDto {
  companyId: string;
  truckId: string;
  legalContractId?: string | null;
  contrabandJobId?: string | null;
  autopilotPolicy?: string | null;
}

export class LaunchRouteCommandHandler {
  constructor(private readonly uow: IUnitOfWork) {}

  public async handle(dto: LaunchRouteDto): Promise<any> {
    return await this.uow.run(async (txUow) => {
      // 1. Verify truck ownership, check state
      const truck = await txUow.rawClient.truck.findUnique({
        where: { id: dto.truckId },
        include: { driver: true, activeRoute: true, garage: true },
      });

      if (!truck || truck.companyId !== dto.companyId) {
        throw new Error('TRUCK_NOT_FOUND');
      }

      if (truck.isImpounded) {
        throw new Error('TRUCK_IMPOUNDED');
      }

      if (truck.activeRoute) {
        throw new Error('TRUCK_ACTIVE');
      }

      // 2. Verify driver is assigned and fit
      const driver = truck.driver;
      if (!driver) {
        throw new Error('NO_ASSIGNED_DRIVER');
      }

      if (driver.fatigue >= 90) {
        throw new Error('DRIVER_EXHAUSTED');
      }

      // 3. Fetch contract details and calculate ETA
      let origin = '';
      let destination = '';
      let distanceKm = 300; // base default
      let cargoType: string | undefined = undefined;

      if (dto.legalContractId) {
        const contract = await txUow.rawClient.legalContract.findUnique({
          where: { id: dto.legalContractId },
        });
        if (!contract) throw new Error('CONTRACT_NOT_FOUND');
        origin = contract.origin;
        destination = contract.destination;
        distanceKm = contract.distanceKm;
        cargoType = contract.cargoType;
      } else if (dto.contrabandJobId) {
        const job = await txUow.rawClient.contrabandJob.findUnique({
          where: { id: dto.contrabandJobId },
        });
        if (!job) throw new Error('JOB_NOT_FOUND');
        origin = job.origin;
        destination = job.destination;
        distanceKm = 350; // Brest/Minsk standard smuggles
      }

      const cargoWeight = AnalyticsService.getCargoWeight(truck.tier);

      // Verify remaining city capacity
      const remainingCapacity = await AnalyticsService.getRemainingFreightCapacity(origin, dto.companyId);
      if (remainingCapacity < cargoWeight) {
        throw new Error(`FREIGHT_SUPPLY_DEPLETED: Remaining capacity is ${remainingCapacity} kg.`);
      }

      // Verify terminal level requirements
      const terminalLevel = truck.garage.terminalLevel;
      const isAllowed = this.isContractAllowed(terminalLevel, distanceKm, cargoWeight, cargoType);
      if (!isAllowed) {
        throw new Error('TERMINAL_LEVEL_TOO_LOW');
      }

      // Base dispatch speed: 70 km/h
      let avgSpeed = 70.0;
      
      // Trait modifiers
      if (driver.trait === 'LEAD_FOOT') avgSpeed += 10.0; // +10 km/h
      if (driver.isStimulated) avgSpeed += 15.0; // pop pills speed boost!

      // Calculate real-world seconds for route transit (1 km = 1 real second for fast gameplay simulation!)
      const transitSeconds = distanceKm; 
      const eta = new Date();
      eta.setSeconds(eta.getSeconds() + transitSeconds);

      // Deduct city freight capacity
      await AnalyticsService.recordFreightShipped(txUow.rawClient, origin, cargoWeight);

      // Record daily transaction for route dispatch
      await AnalyticsService.recordTransaction(
        txUow.rawClient,
        dto.companyId,
        truck.garageId,
        origin,
        'ROUTE_DISPATCHED',
        0
      );

      // Manage contract state based on SPOT, LIMITED, or PERSISTENT types
      if (dto.legalContractId) {
        const contract = await txUow.rawClient.legalContract.findUnique({
          where: { id: dto.legalContractId },
        });
        if (contract) {
          if (contract.contractType === 'SPOT') {
            await txUow.rawClient.legalContract.delete({
              where: { id: dto.legalContractId },
            });
          } else if (contract.contractType === 'LIMITED') {
            const newQuota = (contract.remainingQuota || 0) - cargoWeight;
            if (newQuota <= 0) {
              await txUow.rawClient.legalContract.delete({
                where: { id: dto.legalContractId },
              });
            } else {
              await txUow.rawClient.legalContract.update({
                where: { id: dto.legalContractId },
                data: { remainingQuota: newQuota },
              });
            }
          }
        }
      } else if (dto.contrabandJobId) {
        const job = await txUow.rawClient.contrabandJob.findUnique({
          where: { id: dto.contrabandJobId },
        });
        if (job) {
          if (job.contractType === 'SPOT') {
            await txUow.rawClient.contrabandJob.delete({
              where: { id: dto.contrabandJobId },
            });
          } else if (job.contractType === 'LIMITED') {
            const newQuota = (job.remainingQuota || 0) - cargoWeight;
            if (newQuota <= 0) {
              await txUow.rawClient.contrabandJob.delete({
                where: { id: dto.contrabandJobId },
              });
            } else {
              await txUow.rawClient.contrabandJob.update({
                where: { id: dto.contrabandJobId },
                data: { remainingQuota: newQuota },
              });
            }
          }
        }
      }

      // Create Active Route
      const activeRoute = await txUow.activeRouteRepository.create({
        companyId: dto.companyId,
        truckId: dto.truckId,
        driverId: driver.id,
        legalContractId: dto.legalContractId || null,
        contrabandJobId: dto.contrabandJobId || null,
        progressPct: 0.0,
        eta,
        currentCity: origin,
      });

      // Update route settings directly via repo or state
      activeRoute.state.autopilotPolicy = (dto.autopilotPolicy as any) || 'SAFE';
      await txUow.activeRouteRepository.save(activeRoute);

      // Log dispatch history
      const jobType = dto.contrabandJobId ? 'UNDERWORLD SMUGGLING' : 'LEGAL CONTRACT';
      await txUow.rawClient.truckHistory.create({
        data: {
          truckId: dto.truckId,
          eventType: 'ROUTE_DISPATCH',
          description: `Dispatched on ${jobType} from ${origin} to ${destination} (${distanceKm} km). Estimated transit time: ${transitSeconds}s. Driver: ${driver.name}. Autopilot Policy: ${dto.autopilotPolicy || 'SAFE'}.`,
        },
      });

      // Register Domain Event to emit post-commit
      txUow.addDomainEvent(
        new RouteDispatchedEvent(dto.companyId, {
          routeId: activeRoute.id,
          truckId: dto.truckId,
          driverName: driver.name,
          origin,
          destination,
          message: `DISPATCH INITIATED: Route successfully launched.`,
        })
      );

      return activeRoute.state;
    });
  }

  private isContractAllowed(
    terminalLevel: number,
    distanceKm: number,
    cargoWeight: number,
    cargoType?: string
  ): boolean {
    if (terminalLevel === 1) {
      if (distanceKm >= 200 || cargoWeight >= 10000) {
        return false;
      }
    } else if (terminalLevel === 2) {
      if (distanceKm > 500 || cargoWeight >= 18000) {
        return false;
      }
    } else if (terminalLevel === 3) {
      if (cargoWeight >= 26000) {
        return false;
      }
      if (cargoType === 'STEEL_COILS' || cargoType === 'AGRICULTURAL_MACHINERY') {
        return false;
      }
    }
    return true;
  }
}
