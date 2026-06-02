import { PrismaClient, Prisma } from '@prisma/client';
import { IUnitOfWork } from './IUnitOfWork';
import { ICompanyRepository } from '../repositories/ICompanyRepository';
import { IActiveRouteRepository } from '../repositories/IActiveRouteRepository';
import { IGarageRepository } from '../repositories/IGarageRepository';
import { PrismaCompanyRepository } from '../repositories/prisma/PrismaCompanyRepository';
import { PrismaActiveRouteRepository } from '../repositories/prisma/PrismaActiveRouteRepository';
import { PrismaGarageRepository } from '../repositories/prisma/PrismaGarageRepository';
import { IDomainEvent } from '../../domain/events/DomainEvents';
import { DomainEventDispatcher } from '../../domain/events/DomainEventDispatcher';

export class PrismaUnitOfWork implements IUnitOfWork {
  private transactionEvents: IDomainEvent[] = [];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly txClient?: Prisma.TransactionClient
  ) {}

  public get companyRepository(): ICompanyRepository {
    return new PrismaCompanyRepository(this.txClient || this.prisma);
  }

  public get rawClient(): any {
    return this.txClient || this.prisma;
  }

  public get activeRouteRepository(): IActiveRouteRepository {
    return new PrismaActiveRouteRepository(this.txClient || this.prisma);
  }

  public get garageRepository(): IGarageRepository {
    return new PrismaGarageRepository(this.txClient || this.prisma);
  }

  public addDomainEvent(event: IDomainEvent): void {
    this.transactionEvents.push(event);
  }

  public async run<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    if (this.txClient) {
      // Already running inside an active transaction scope
      return work(this);
    }

    // Start secure Prisma $transaction
    return await this.prisma.$transaction(async (tx) => {
      const transactionalUow = new PrismaUnitOfWork(this.prisma, tx);
      const result = await work(transactionalUow);

      // Save accumulated transaction events to parent array to emit post-commit
      this.transactionEvents = transactionalUow.transactionEvents;
      return result;
    }).then(async (result) => {
      // POST-COMMIT SUCCESS: Safe to emit domain events!
      for (const event of this.transactionEvents) {
        await DomainEventDispatcher.dispatch(event);
      }
      this.transactionEvents = [];
      return result;
    });
  }
}
