import { ICompanyRepository } from '../repositories/ICompanyRepository';
import { IActiveRouteRepository } from '../repositories/IActiveRouteRepository';
import { IGarageRepository } from '../repositories/IGarageRepository';
import { IDomainEvent } from '../../domain/events/DomainEvents';

export interface IUnitOfWork {
  companyRepository: ICompanyRepository;
  activeRouteRepository: IActiveRouteRepository;
  garageRepository: IGarageRepository;
  readonly rawClient: any;
  
  /**
   * Schedules a domain event to be dispatched ONLY after transaction successfully commits
   */
  addDomainEvent(event: IDomainEvent): void;

  /**
   * Executes an asynchronous business payload inside a secure PostgreSQL ACID transaction
   */
  run<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T>;
}
