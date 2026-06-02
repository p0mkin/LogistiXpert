import { IUnitOfWork } from '../../infrastructure/persistence/IUnitOfWork';
import { GenericDomainEvent } from '../../domain/events/DomainEvents';

export interface RepayLoanDto {
  companyId: string;
  amount: number;
}

export class RepayLoanCommandHandler {
  constructor(private readonly uow: IUnitOfWork) {}

  public async handle(dto: RepayLoanDto): Promise<{ remainingPrincipal: number; payAmount: number }> {
    return await this.uow.run(async (txUow) => {
      // 1. Fetch aggregate securely inside transaction boundary
      const company = await txUow.companyRepository.getById(dto.companyId);
      if (!company) {
        throw new Error('COMPANY_NOT_FOUND');
      }

      // 2. Perform state transition encapsulated in the rich aggregate
      const payAmount = company.repay(dto.amount);

      // 3. Save updated state back to persistence layer
      await txUow.companyRepository.save(company);

      // 4. Register Domain Event to emit post-commit for real-time update
      txUow.addDomainEvent(
        new GenericDomainEvent(company.id, 'company:balance_update', {
          legalBalance: parseFloat(company.legalBalance.toFixed(2)),
          blackMarketBalance: parseFloat(company.blackMarketBalance.toFixed(2)),
          message: `DEBT REPAYMENT COMPLETED: Settled $${payAmount.toFixed(2)} debt.`,
        })
      );

      return {
        remainingPrincipal: company.activeDebtPrincipal,
        payAmount,
      };
    });
  }
}
