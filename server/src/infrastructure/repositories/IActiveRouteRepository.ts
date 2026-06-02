import { ActiveRouteAggregate } from '../../domain/aggregates/ActiveRoute';

export interface IActiveRouteRepository {
  getById(id: string): Promise<ActiveRouteAggregate | null>;
  getByTruckId(truckId: string): Promise<ActiveRouteAggregate | null>;
  getRoutesForSimulation(): Promise<ActiveRouteAggregate[]>;
  save(route: ActiveRouteAggregate): Promise<void>;
  create(data: {
    companyId: string;
    truckId: string;
    driverId: string;
    legalContractId?: string | null;
    contrabandJobId?: string | null;
    clanContractId?: string | null;
    progressPct?: number;
    eta: Date;
    currentCity: string;
  }): Promise<ActiveRouteAggregate>;
  delete(id: string): Promise<void>;
}
