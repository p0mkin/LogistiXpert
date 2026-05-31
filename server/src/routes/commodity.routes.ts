import { Router, Response } from 'express';
import { PrismaClient, CommodityType } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { CommodityMarketService } from '../services/commodity.service';

const router = Router();
const prisma = new PrismaClient();

// 1. GET ALL CURRENT COMMODITY PRICES (Public)
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const prices = await prisma.commodityMarket.findMany({
      orderBy: { commodityType: 'asc' },
    });
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve commodity prices.' });
  }
});

// 2. PURCHASE COMMODITY INTO GARAGE STOCKPILE (Authenticated)
router.post('/buy', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { garageId, commodityType, amount } = req.body;

  if (!garageId || !commodityType || !amount || amount <= 0) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'garageId, a valid commodityType, and an amount greater than 0 are required.',
    });
  }

  // Validate commodity type
  if (!Object.values(CommodityType).includes(commodityType as CommodityType)) {
    return res.status(400).json({
      error: 'INVALID_COMMODITY',
      message: `Invalid commodityType. Supported values are: ${Object.values(CommodityType).join(', ')}`,
    });
  }

  try {
    const result = await CommodityMarketService.purchaseCommodity(
      companyId,
      garageId,
      commodityType as CommodityType,
      parseFloat(amount)
    );

    res.json({
      message: 'Commodity purchased and stockpiled successfully!',
      totalCost: result.totalCost,
      unitPrice: result.unitPrice,
      garage: {
        id: result.garage.id,
        city: result.garage.city,
        dieselStorage: result.garage.dieselStorage,
        electricityStorage: result.garage.electricityStorage,
        adblueStorage: result.garage.adblueStorage,
        co2Allowances: result.garage.co2Allowances,
      },
    });

  } catch (error: any) {
    const code = error.message || 'PURCHASE_FAILED';
    let status = 500;
    let message = 'Failed to process commodity purchase';

    switch (code) {
      case 'COMMODITY_NOT_FOUND':
        status = 404;
        message = 'The requested commodity type was not found in the market.';
        break;
      case 'COMPANY_NOT_FOUND':
        status = 404;
        message = 'Your company profile was not found.';
        break;
      case 'INSUFFICIENT_FUNDS':
        status = 400;
        message = 'Your company has insufficient legal balance to complete this purchase.';
        break;
      case 'GARAGE_NOT_FOUND':
        status = 404;
        message = 'The specified garage was not found or does not belong to your company.';
        break;
      case 'STORAGE_CAPACITY_EXCEEDED':
        status = 400;
        message = 'Purchase exceeds the stockpiled storage capacity limits of this garage. Upgrade your garage to increase capacity!';
        break;
    }

    res.status(status).json({ error: code, message });
  }
});

export default router;
