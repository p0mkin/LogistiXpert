import { GarageAggregate } from '../../domain/aggregates/Garage';

export interface IGarageRepository {
  getById(id: string): Promise<GarageAggregate | null>;
  save(garage: GarageAggregate): Promise<void>;
}
