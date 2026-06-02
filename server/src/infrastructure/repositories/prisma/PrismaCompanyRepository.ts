import { PrismaClient, Prisma } from '@prisma/client';
import { ICompanyRepository } from '../ICompanyRepository';
import { CompanyAggregate } from '../../../domain/aggregates/Company';

export class PrismaCompanyRepository implements ICompanyRepository {
  constructor(private readonly client: Prisma.TransactionClient | PrismaClient) {}

  public async getById(id: string): Promise<CompanyAggregate | null> {
    const raw = await this.client.company.findUnique({
      where: { id },
      include: {
        garages: true,
        trucks: true,
      },
    });
    return raw ? new CompanyAggregate(raw) : null;
  }

  public async save(company: CompanyAggregate): Promise<void> {
    await this.client.company.update({
      where: { id: company.id },
      data: {
        legalBalance: company.state.legalBalance,
        blackMarketBalance: company.state.blackMarketBalance,
        activeDebtPrincipal: company.state.activeDebtPrincipal,
        activeDebtInterest: company.state.activeDebtInterest,
        reputationScore: company.state.reputationScore,
        policeHeat: company.state.policeHeat,
        isPublic: company.state.isPublic,
        warningInsolventAt: company.state.warningInsolventAt,
      },
    });
  }
}
