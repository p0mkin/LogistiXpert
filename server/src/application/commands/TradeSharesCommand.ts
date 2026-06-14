import { IUnitOfWork } from '../../infrastructure/persistence/IUnitOfWork';
import { FinanceService } from '../../services/finance.service';
import { GenericDomainEvent } from '../../domain/events/DomainEvents';

export interface TradeSharesDto {
  buyerCompanyId: string;
  targetCompanyId: string;
  action: 'BUY' | 'SELL';
  sharesAmount: number;
}

export interface TradeSharesResult {
  message: string;
  sharesOwned?: number;
  profit?: number;
  taxCharged?: number;
  netProceeds?: number;
  holdingPeriod?: 'SHORT_TERM_DAY_TRADE' | 'LONG_TERM_STABLE';
}

export class TradeSharesCommandHandler {
  constructor(private readonly uow: IUnitOfWork) {}

  public async handle(dto: TradeSharesDto): Promise<TradeSharesResult> {
    return await this.uow.run(async (txUow) => {
      // 1. Fetch aggregates securely inside transaction
      const buyer = await txUow.companyRepository.getById(dto.buyerCompanyId);
      if (!buyer) {
        throw new Error('BUYER_COMPANY_NOT_FOUND');
      }

      const targetRaw = await txUow.rawClient.company.findUnique({
        where: { id: dto.targetCompanyId },
      });
      if (!targetRaw) {
        throw new Error('TARGET_COMPANY_NOT_FOUND');
      }

      if (!targetRaw.isPublic) {
        throw new Error('TARGET_NOT_PUBLIC');
      }

      // 2. Fetch target valuation inside transaction context
      const targetValuation = await FinanceService.calculateCompanyValuation(dto.targetCompanyId, txUow.rawClient);
      const sharePrice = targetValuation / targetRaw.totalShares;
      const totalCost = sharePrice * dto.sharesAmount;

      const existingHolding = await txUow.rawClient.companyShare.findUnique({
        where: {
          companyId_ownerCompanyId: {
            companyId: dto.targetCompanyId,
            ownerCompanyId: dto.buyerCompanyId,
          },
        },
      });

      if (dto.action.toUpperCase() === 'BUY') {
        const currentSharesOwned = existingHolding ? existingHolding.shares : 0;

        if (currentSharesOwned >= 0) {
          // Standard Long Buy
          const newSharesOwned = currentSharesOwned + dto.sharesAmount;
          const { finalCost } = buyer.calculateStockPurchaseCost(
            {
              isPublic: targetRaw.isPublic,
              totalShares: targetRaw.totalShares,
              clanId: targetRaw.clanId,
              valuation: targetValuation,
            },
            dto.sharesAmount,
            currentSharesOwned
          );

          buyer.buyShares(finalCost);
          await txUow.companyRepository.save(buyer);

          await txUow.rawClient.companyShare.upsert({
            where: {
              companyId_ownerCompanyId: {
                companyId: dto.targetCompanyId,
                ownerCompanyId: dto.buyerCompanyId,
              },
            },
            update: {
              shares: { increment: dto.sharesAmount },
              avgPurchasePrice: existingHolding
                ? (Number(existingHolding.avgPurchasePrice) * currentSharesOwned + totalCost) / newSharesOwned
                : sharePrice,
              purchasedAt: new Date(),
            },
            create: {
              companyId: dto.targetCompanyId,
              ownerCompanyId: dto.buyerCompanyId,
              shares: dto.sharesAmount,
              avgPurchasePrice: sharePrice,
              purchasedAt: new Date(),
            },
          });

          txUow.addDomainEvent(
            new GenericDomainEvent(buyer.id, 'company:balance_update', {
              legalBalance: parseFloat(buyer.legalBalance.toFixed(2)),
              blackMarketBalance: parseFloat(buyer.blackMarketBalance.toFixed(2)),
              message: `SUCCESS: Purchased ${dto.sharesAmount} shares of ${targetRaw.name} at $${sharePrice.toFixed(4)}/share.`,
            })
          );

          return {
            message: `SUCCESS: Purchased ${dto.sharesAmount} shares of ${targetRaw.name} at $${sharePrice.toFixed(4)}/share.`,
            sharesOwned: newSharesOwned,
          };
        } else {
          // Covering Short Position
          const absShort = Math.abs(currentSharesOwned);
          const coverAmount = Math.min(dto.sharesAmount, absShort);
          const longAmount = dto.sharesAmount - coverAmount;

          const entryPrice = Number(existingHolding!.avgPurchasePrice);
          const profit = (entryPrice - sharePrice) * coverAmount;

          // Compute Capital Gains Tax on cover profit
          const holdsShortTerm = Date.now() - new Date(existingHolding!.purchasedAt).getTime() < 10 * 60 * 1000;
          let capGainsRate = 0.25;
          const jurisdiction = buyer.state.jurisdiction;
          if (holdsShortTerm) {
            if (jurisdiction === 'SCANDINAVIA') capGainsRate = 0.45;
            else if (jurisdiction === 'GERMANY') capGainsRate = 0.40;
            else if (jurisdiction === 'BALTICS') capGainsRate = 0.25;
            else if (jurisdiction === 'SWITZERLAND') capGainsRate = 0.08;
            else if (jurisdiction === 'CAYMAN_ISLANDS') capGainsRate = 0.00;
            else capGainsRate = 0.15;
          } else {
            if (jurisdiction === 'SCANDINAVIA') capGainsRate = 0.30;
            else if (jurisdiction === 'GERMANY') capGainsRate = 0.25;
            else if (jurisdiction === 'BALTICS') capGainsRate = 0.19;
            else if (jurisdiction === 'SWITZERLAND') capGainsRate = 0.05;
            else if (jurisdiction === 'CAYMAN_ISLANDS') capGainsRate = 0.00;
            else capGainsRate = 0.10;
          }

          const tax = profit > 0 ? profit * capGainsRate : 0;
          const costToCover = (coverAmount * sharePrice) + tax;

          if (Number(buyer.legalBalance) < costToCover) {
            throw new Error('INSUFFICIENT_FUNDS');
          }

          buyer.buyShares(costToCover);
          let newShares = currentSharesOwned + coverAmount;

          if (newShares === 0) {
            if (longAmount > 0) {
              // Remaining goes long
              const { finalCost: longCost } = buyer.calculateStockPurchaseCost(
                {
                  isPublic: targetRaw.isPublic,
                  totalShares: targetRaw.totalShares,
                  clanId: targetRaw.clanId,
                  valuation: targetValuation,
                },
                longAmount,
                0
              );
              buyer.buyShares(longCost);
              newShares = longAmount;

              await txUow.rawClient.companyShare.update({
                where: { id: existingHolding!.id },
                data: {
                  shares: longAmount,
                  avgPurchasePrice: sharePrice,
                  purchasedAt: new Date(),
                },
              });
            } else {
              await txUow.rawClient.companyShare.delete({
                where: { id: existingHolding!.id },
              });
            }
          } else {
            // Partial cover
            await txUow.rawClient.companyShare.update({
              where: { id: existingHolding!.id },
              data: {
                shares: newShares,
                // entry price remains same
              },
            });
          }

          await txUow.companyRepository.save(buyer);

          txUow.addDomainEvent(
            new GenericDomainEvent(buyer.id, 'company:balance_update', {
              legalBalance: parseFloat(buyer.legalBalance.toFixed(2)),
              blackMarketBalance: parseFloat(buyer.blackMarketBalance.toFixed(2)),
              message: `COVER SHORT: Covered ${coverAmount} shares of ${targetRaw.name}. Profit: $${profit.toFixed(2)}, Tax: $${tax.toFixed(2)}. Net Cost: $${costToCover.toFixed(2)}.`,
            })
          );

          return {
            message: `COVER SHORT: Covered ${coverAmount} shares of ${targetRaw.name}. Net Cost: $${costToCover.toFixed(2)}.`,
            sharesOwned: newShares,
            profit: parseFloat(profit.toFixed(2)),
            taxCharged: parseFloat(tax.toFixed(2)),
          };
        }

      } else if (dto.action.toUpperCase() === 'SELL') {
        const currentSharesOwned = existingHolding ? existingHolding.shares : 0;

        if (currentSharesOwned > 0) {
          // Standard Long Sell
          const sellAmount = Math.min(dto.sharesAmount, currentSharesOwned);
          const shortAmount = dto.sharesAmount - sellAmount;

          const { profit, tax, netProceeds, holdsShortTerm } = buyer.calculateCapitalGainsTax(
            existingHolding!.purchasedAt,
            sellAmount,
            Number(existingHolding!.avgPurchasePrice),
            sharePrice
          );

          buyer.sellShares(netProceeds);
          let newShares = currentSharesOwned - sellAmount;

          if (newShares === 0) {
            if (shortAmount > 0) {
              // Open short position
              const maxShort = targetRaw.totalShares * 0.20;
              if (shortAmount > maxShort) {
                throw new Error('EXCEEDS_SHORT_LIMIT');
              }
              const shortProceeds = shortAmount * sharePrice;
              buyer.sellShares(shortProceeds);
              newShares = -shortAmount;

              await txUow.rawClient.companyShare.update({
                where: { id: existingHolding!.id },
                data: {
                  shares: -shortAmount,
                  avgPurchasePrice: sharePrice,
                  purchasedAt: new Date(),
                },
              });
            } else {
              await txUow.rawClient.companyShare.delete({
                where: { id: existingHolding!.id },
              });
            }
          } else {
            await txUow.rawClient.companyShare.update({
              where: { id: existingHolding!.id },
              data: { shares: { decrement: sellAmount } },
            });
          }

          await txUow.companyRepository.save(buyer);

          txUow.addDomainEvent(
            new GenericDomainEvent(buyer.id, 'company:balance_update', {
              legalBalance: parseFloat(buyer.legalBalance.toFixed(2)),
              blackMarketBalance: parseFloat(buyer.blackMarketBalance.toFixed(2)),
              message: `SUCCESS: Sold ${sellAmount} shares of ${targetRaw.name} at $${sharePrice.toFixed(4)}/share.`,
            })
          );

          return {
            message: `SUCCESS: Sold ${sellAmount} shares of ${targetRaw.name} at $${sharePrice.toFixed(4)}/share.`,
            sharesOwned: newShares,
            profit: parseFloat(profit.toFixed(2)),
            taxCharged: parseFloat(tax.toFixed(2)),
            netProceeds: parseFloat(netProceeds.toFixed(2)),
          };
        } else {
          // Open or Increase Short Position
          const currentShort = Math.abs(currentSharesOwned);
          const newShort = currentShort + dto.sharesAmount;
          const maxShort = targetRaw.totalShares * 0.20;

          if (newShort > maxShort) {
            throw new Error('EXCEEDS_SHORT_LIMIT');
          }

          const shortProceeds = dto.sharesAmount * sharePrice;
          buyer.sellShares(shortProceeds);
          await txUow.companyRepository.save(buyer);

          const newAvgPrice = existingHolding
            ? (Number(existingHolding.avgPurchasePrice) * currentShort + shortProceeds) / newShort
            : sharePrice;

          await txUow.rawClient.companyShare.upsert({
            where: {
              companyId_ownerCompanyId: {
                companyId: dto.targetCompanyId,
                ownerCompanyId: dto.buyerCompanyId,
              },
            },
            update: {
              shares: -newShort,
              avgPurchasePrice: newAvgPrice,
              purchasedAt: new Date(),
            },
            create: {
              companyId: dto.targetCompanyId,
              ownerCompanyId: dto.buyerCompanyId,
              shares: -dto.sharesAmount,
              avgPurchasePrice: sharePrice,
              purchasedAt: new Date(),
            },
          });

          txUow.addDomainEvent(
            new GenericDomainEvent(buyer.id, 'company:balance_update', {
              legalBalance: parseFloat(buyer.legalBalance.toFixed(2)),
              blackMarketBalance: parseFloat(buyer.blackMarketBalance.toFixed(2)),
              message: `OPEN SHORT: Shorted ${dto.sharesAmount} shares of ${targetRaw.name}. Proceeds: +$${shortProceeds.toFixed(2)}.`,
            })
          );

          return {
            message: `OPEN SHORT: Shorted ${dto.sharesAmount} shares of ${targetRaw.name}. Proceeds: +$${shortProceeds.toFixed(2)}.`,
            sharesOwned: -newShort,
          };
        }
      } else {
        throw new Error('INVALID_ACTION');
      }
    });
  }
}
