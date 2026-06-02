import { CompanyAggregate } from '../../domain/aggregates/Company';

export interface ICompanyRepository {
  getById(id: string): Promise<CompanyAggregate | null>;
  save(company: CompanyAggregate): Promise<void>;
}
