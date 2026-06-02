import { IUnitOfWork } from '../../infrastructure/persistence/IUnitOfWork';
import { LoanBorrowedEvent } from '../../domain/events/DomainEvents';

export interface BorrowLoanDto {
  companyId: string;
  amount: number;
}

export class BorrowLoanCommandHandler {
  constructor(private readonly uow: IUnitOfWork) {}

  /**
   * Orchestrates dynamic collateral lookups and borrows bank loans inside transactions
   */
  public async handle(dto: BorrowLoanDto): Promise<{ activeDebtPrincipal: number; activeDebtInterest: number }> {
    return await this.uow.run(async (txUow) => {
      // 1. Fetch aggregate securely inside transaction boundary
      const company = await txUow.companyRepository.getById(dto.companyId);
      if (!company) {
        throw new Error('COMPANY_NOT_FOUND');
      }

      // 2. Perform state transition encapsulated in the rich aggregate
      company.borrow(dto.amount);

      // 3. Save updated state back to persistence layer
      await txUow.companyRepository.save(company);

      // 4. Register Domain Event to emit post-commit
      txUow.addDomainEvent(
        new LoanBorrowedEvent(company.id, {
          amount: dto.amount,
          activeDebtPrincipal: company.activeDebtPrincipal,
          activeDebtInterest: company.state.activeDebtInterest,
          message: `FINANCING APPROVED: Borrowed $${dto.amount.toFixed(2)} Clean Cash.`,
        })
      );

      return {
        activeDebtPrincipal: company.activeDebtPrincipal,
        activeDebtInterest: company.state.activeDebtInterest,
      };
    });
  }
}
