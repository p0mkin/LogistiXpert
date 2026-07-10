import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { ClanService } from '../services/clan.service';
import { GameWebSocketServer } from '../websocket';

const router = Router();
const prisma = new PrismaClient();

// Protect all clan routes with JWT
router.use(authenticateJWT);

/**
 * GET /api/clan/info
 * Fetch clan details for the player's company, if any
 */
router.get('/info', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        clan: {
          include: {
            companies: {
              select: {
                id: true,
                name: true,
                reputationScore: true,
                legalBalance: true,
                blackMarketBalance: true,
              },
            },
            clanContracts: {
              include: {
                contributions: {
                  include: {
                    company: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }

    if (!company.clan) {
      return res.json({ inClan: false });
    }

    const maxCompanies = await ClanService.calculateMaxClanCompanies(company.clan.id);

    res.json({
      inClan: true,
      clan: {
        id: company.clan.id,
        name: company.clan.name,
        treasury: parseFloat(Number(company.clan.treasury).toFixed(2)),
        reputation: company.clan.reputation,
        createdAt: company.clan.createdAt,
        companies: company.clan.companies.map((c) => ({
          id: c.id,
          name: c.name,
          reputationScore: c.reputationScore,
          legalBalance: parseFloat(Number(c.legalBalance).toFixed(2)),
          blackMarketBalance: parseFloat(Number(c.blackMarketBalance).toFixed(2)),
          role: ClanService.getCompanyRole(c.id),
        })),
        clanContracts: company.clan.clanContracts.map((cc) => ({
          ...cc,
          payoutLegal: parseFloat(Number(cc.payoutLegal).toFixed(2)),
          payoutBlack: parseFloat(Number(cc.payoutBlack).toFixed(2)),
        })),
        maxCompanies,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/create
 * Create a new clan
 */
router.post('/create', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const userId = req.user!.id;
  const { name } = req.body;

  if (!name || name.trim().length < 3) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Clan name must be at least 3 characters.' });
  }

  try {
    // 1. Verify owner role
    const membership = await prisma.companyMember.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership || membership.role !== 'OWNER') {
      return res.status(403).json({ error: 'NOT_OWNER', message: 'Only the company owner can create a clan.' });
    }

    // 2. Check if already in a clan
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }

    if (company.clanId) {
      return res.status(400).json({ error: 'ALREADY_IN_CLAN', message: 'Company is already in a clan.' });
    }

    // 3. Check clean funds
    if (Number(company.legalBalance) < 25000) {
      return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Creating a clan costs $25,000 clean.' });
    }

    // 4. Check name uniqueness
    const existing = await prisma.clan.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'CLAN_NAME_TAKEN', message: 'This clan name is already taken.' });
    }

    // 5. Create clan in transaction
    const newClan = await prisma.$transaction(async (tx) => {
      const clan = await tx.clan.create({
        data: {
          name,
          treasury: 0.0,
          reputation: 0,
        },
      });

      await tx.company.update({
        where: { id: companyId },
        data: {
          legalBalance: { decrement: 25000 },
          clanId: clan.id,
        },
      });

      return clan;
    });

    ClanService.setCompanyRole(companyId, 'OWNER');

    res.status(201).json({
      success: true,
      message: `Clan "${name}" created successfully! Deducted $25,000 clean.`,
      clan: newClan,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/join
 * Join an existing clan
 */
router.post('/join', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { clanId } = req.body;

  if (!clanId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Clan ID is required.' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }

    if (company.clanId) {
      return res.status(400).json({ error: 'ALREADY_IN_CLAN', message: 'Your company is already in a clan.' });
    }

    const clan = await prisma.clan.findUnique({
      where: { id: clanId },
      include: { companies: true },
    });

    if (!clan) {
      return res.status(404).json({ error: 'CLAN_NOT_FOUND', message: 'Clan not found.' });
    }

    const maxCapacity = await ClanService.calculateMaxClanCompanies(clanId);
    if (clan.companies.length >= maxCapacity) {
      return res.status(400).json({ error: 'CLAN_FULL', message: `Clan has reached its maximum capacity of ${maxCapacity} companies.` });
    }

    await prisma.company.update({
      where: { id: companyId },
      data: { clanId: clan.id },
    });

    ClanService.setCompanyRole(companyId, 'MEMBER');

    GameWebSocketServer.broadcastToClan(clan.id, 'clan:member_joined', {
      companyId,
      companyName: company.name,
      message: `${company.name} has joined the clan!`,
    });

    res.json({
      success: true,
      message: `Joined clan "${clan.name}" successfully!`,
      clanId: clan.id,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/leave
 * Leave the current clan
 */
router.post('/leave', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }

    if (!company.clanId) {
      return res.status(400).json({ error: 'NOT_IN_CLAN', message: 'Your company is not in a clan.' });
    }

    const clanId = company.clanId;

    await prisma.company.update({
      where: { id: companyId },
      data: { clanId: null },
    });

    ClanService.removeCompanyRole(companyId);

    GameWebSocketServer.broadcastToClan(clanId, 'clan:member_left', {
      companyId,
      companyName: company.name,
      message: `${company.name} has left the clan.`,
    });

    // Clean up clan if empty
    const remaining = await prisma.company.count({ where: { clanId } });
    if (remaining === 0) {
      await prisma.clan.delete({ where: { id: clanId } });
    }

    res.json({
      success: true,
      message: 'Successfully left the clan.',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/clan/contracts
 * Get list of active clan contracts
 */
router.get('/contracts', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company || !company.clanId) {
      return res.status(400).json({ error: 'NOT_IN_CLAN', message: 'You must be in a clan to view clan contracts.' });
    }

    const contracts = await prisma.clanContract.findMany({
      where: { clanId: company.clanId },
      include: {
        contributions: {
          include: {
            company: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    res.json(contracts.map((c) => ({
      ...c,
      payoutLegal: parseFloat(Number(c.payoutLegal).toFixed(2)),
      payoutBlack: parseFloat(Number(c.payoutBlack).toFixed(2)),
    })));
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/contract/publish
 * Publish a new clan contract (owners / partners only)
 */
router.post('/contract/publish', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const userId = req.user!.id;
  const { title, cargoType, origin, destination, distanceKm, totalVolume, payoutLegal, payoutBlack } = req.body;

  if (!title || !origin || !destination || !distanceKm || !totalVolume || payoutLegal === undefined || payoutBlack === undefined) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Missing required contract fields.' });
  }

  try {
    const membership = await prisma.companyMember.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'PARTNER')) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only owners or partners can publish clan contracts.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company || !company.clanId) {
      return res.status(400).json({ error: 'NOT_IN_CLAN', message: 'Your company is not in a clan.' });
    }

    const contract = await ClanService.publishClanContract(company.clanId, {
      title,
      cargoType,
      origin,
      destination,
      distanceKm: parseFloat(distanceKm),
      totalVolume: parseFloat(totalVolume),
      payoutLegal: parseFloat(payoutLegal),
      payoutBlack: parseFloat(payoutBlack),
    });

    res.status(201).json(contract);
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/clan/list
 * Get list of joinable clans
 */
router.get('/list', async (req: AuthRequest, res: Response) => {
  try {
    const clans = await prisma.clan.findMany({
      include: {
        companies: {
          select: { id: true, name: true },
        },
      },
      take: 50,
      orderBy: { reputation: 'desc' },
    });

    const results = [];
    for (const c of clans) {
      const maxCompanies = await ClanService.calculateMaxClanCompanies(c.id);
      results.push({
        id: c.id,
        name: c.name,
        reputation: c.reputation,
        treasury: parseFloat(Number(c.treasury).toFixed(2)),
        memberCount: c.companies.length,
        maxCompanies,
      });
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/clan/leaderboard
 * Top clans by reputation
 */
router.get('/leaderboard', async (req: AuthRequest, res: Response) => {
  try {
    const topClans = await prisma.clan.findMany({
      take: 10,
      orderBy: { reputation: 'desc' },
      include: {
        companies: {
          select: { id: true, name: true },
        },
      },
    });

    const results = [];
    for (const c of topClans) {
      const maxCompanies = await ClanService.calculateMaxClanCompanies(c.id);
      results.push({
        id: c.id,
        name: c.name,
        reputation: c.reputation,
        treasury: parseFloat(Number(c.treasury).toFixed(2)),
        memberCount: c.companies.length,
        maxCompanies,
      });
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/clan/chat
 * Fetch last 50 chat messages for the player's clan
 */
router.get('/chat', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company || !company.clanId) {
      return res.status(400).json({ error: 'NOT_IN_CLAN', message: 'You must be in a clan to view chat.' });
    }

    const messages = ClanService.getChatMessages(company.clanId);
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/chat
 * Post a new message to the clan board
 */
router.post('/chat', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { text } = req.body;

  if (!text || text.trim().length === 0 || text.length > 200) {
    return res.status(400).json({ error: 'INVALID_TEXT', message: 'Message text must be between 1 and 200 characters.' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company || !company.clanId) {
      return res.status(400).json({ error: 'NOT_IN_CLAN', message: 'You must be in a clan to post chat messages.' });
    }

    const messagePayload = {
      senderId: companyId,
      senderName: company.name,
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    ClanService.addChatMessage(company.clanId, messagePayload);

    GameWebSocketServer.broadcastToClan(company.clanId, 'clan:chat_message', messagePayload);

    res.status(201).json({ success: true, message: 'Message posted.' });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/member/promote
 * Promote a company to OFFICER
 */
router.post('/member/promote', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { targetCompanyId } = req.body;

  try {
    const actorRole = ClanService.getCompanyRole(companyId);
    if (actorRole !== 'OWNER') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only the clan owner can promote members.' });
    }

    const actor = await prisma.company.findUnique({ where: { id: companyId } });
    const target = await prisma.company.findUnique({ where: { id: targetCompanyId } });

    if (!actor || !target || actor.clanId !== target.clanId || !actor.clanId) {
      return res.status(400).json({ error: 'INVALID_MEMBER', message: 'Target company must belong to your clan.' });
    }

    ClanService.setCompanyRole(targetCompanyId, 'OFFICER');

    GameWebSocketServer.broadcastToClan(actor.clanId, 'clan:member_promoted', {
      companyId: targetCompanyId,
      companyName: target.name,
      message: `${target.name} has been promoted to OFFICER!`,
    });

    res.json({ success: true, message: `${target.name} promoted to OFFICER.` });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/member/demote
 * Demote an OFFICER to MEMBER
 */
router.post('/member/demote', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { targetCompanyId } = req.body;

  try {
    const actorRole = ClanService.getCompanyRole(companyId);
    if (actorRole !== 'OWNER') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only the clan owner can demote members.' });
    }

    const actor = await prisma.company.findUnique({ where: { id: companyId } });
    const target = await prisma.company.findUnique({ where: { id: targetCompanyId } });

    if (!actor || !target || actor.clanId !== target.clanId || !actor.clanId) {
      return res.status(400).json({ error: 'INVALID_MEMBER', message: 'Target company must belong to your clan.' });
    }

    ClanService.setCompanyRole(targetCompanyId, 'MEMBER');

    GameWebSocketServer.broadcastToClan(actor.clanId, 'clan:member_demoted', {
      companyId: targetCompanyId,
      companyName: target.name,
      message: `${target.name} has been demoted to MEMBER.`,
    });

    res.json({ success: true, message: `${target.name} demoted to MEMBER.` });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/member/kick
 * Kick a company from the clan
 */
router.post('/member/kick', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { targetCompanyId } = req.body;

  try {
    const actorRole = ClanService.getCompanyRole(companyId);
    const targetRole = ClanService.getCompanyRole(targetCompanyId);

    if (actorRole !== 'OWNER' && actorRole !== 'OFFICER') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only owners or officers can kick members.' });
    }

    if (targetRole === 'OWNER' || (actorRole === 'OFFICER' && targetRole === 'OFFICER')) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to kick this member.' });
    }

    const actor = await prisma.company.findUnique({ where: { id: companyId } });
    const target = await prisma.company.findUnique({ where: { id: targetCompanyId } });

    if (!actor || !target || actor.clanId !== target.clanId || !actor.clanId) {
      return res.status(400).json({ error: 'INVALID_MEMBER', message: 'Target company must belong to your clan.' });
    }

    await prisma.company.update({
      where: { id: targetCompanyId },
      data: { clanId: null },
    });

    ClanService.removeCompanyRole(targetCompanyId);

    GameWebSocketServer.broadcastToClan(actor.clanId, 'clan:member_kicked', {
      companyId: targetCompanyId,
      companyName: target.name,
      message: `${target.name} has been kicked from the clan by an administrator.`,
    });

    res.json({ success: true, message: `${target.name} kicked from clan.` });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/treasury/distribute
 * Distribute clan treasury funds back to members (Owner/Officer only)
 */
router.post('/treasury/distribute', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { amount } = req.body;

  if (amount === undefined || amount <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Specify a positive amount.' });
  }

  try {
    const actorRole = ClanService.getCompanyRole(companyId);
    if (actorRole !== 'OWNER' && actorRole !== 'OFFICER') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only owners or officers can distribute treasury funds.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        clan: {
          include: {
            companies: true,
          },
        },
      },
    });

    if (!company || !company.clan) {
      return res.status(400).json({ error: 'NO_CLAN', message: 'You must belong to a clan.' });
    }

    const clan = company.clan;
    if (Number(clan.treasury) < amount) {
      return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: `Clan treasury only has $${Number(clan.treasury).toFixed(2)} available.` });
    }

    const membersCount = clan.companies.length;
    if (membersCount === 0) {
      return res.status(400).json({ error: 'NO_MEMBERS', message: 'Clan has no member companies.' });
    }

    const share = amount / membersCount;

    await prisma.$transaction(async (tx) => {
      // 1. Deduct from treasury
      await tx.clan.update({
        where: { id: clan.id },
        data: { treasury: { decrement: amount } },
      });

      // 2. Add to each member company
      for (const member of clan.companies) {
        await tx.company.update({
          where: { id: member.id },
          data: { legalBalance: { increment: share } },
        });

        // Broadcast balance update
        GameWebSocketServer.sendToCompany(member.id, 'company:balance_update', {
          legalBalance: parseFloat((Number(member.legalBalance) + share).toFixed(2)),
          blackMarketBalance: parseFloat(Number(member.blackMarketBalance).toFixed(2)),
          message: `CLAN DIVIDEND: Received $${share.toFixed(2)} Clean Cash distributed from Clan Treasury.`,
        });
      }
    });

    // Post in clan chat
    const alertMsg = `📢 TREASURY DISTRIBUTION: Officer distributed $${amount.toFixed(2)} Clean Cash equally among all ${membersCount} members ($${share.toFixed(2)}/company).`;
    ClanService.addChatMessage(clan.id, {
      senderId: 'SYSTEM',
      senderName: 'SYN-NETWORK',
      text: alertMsg,
      timestamp: new Date().toISOString(),
    });

    GameWebSocketServer.broadcastToClan(clan.id, 'clan:chat_message', {
      senderId: 'SYSTEM',
      senderName: 'SYN-NETWORK',
      message: alertMsg,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Successfully distributed $${amount.toFixed(2)} Clean Cash equally among all ${membersCount} members.`,
      share,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/clan/protection-fund/contribute
 * Feature 50 — Clan Mutual Protection Fund
 * Contribute dirty cash to the clan protection fund (treasury)
 */
router.post('/protection-fund/contribute', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Amount must be greater than 0.' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { clan: true }
    });

    if (!company || !company.clan) {
      return res.status(400).json({ error: 'NO_CLAN', message: 'You must be in a clan to contribute to the protection fund.' });
    }

    if (company.blackMarketBalance.toNumber() < amount) {
      return res.status(400).json({ error: 'INSUFFICIENT_BLACK_MARKET_CASH', message: 'Insufficient Black Market balance.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Deduct from company
      const updatedCompany = await tx.company.update({
        where: { id: companyId },
        data: { blackMarketBalance: { decrement: amount } }
      });

      // Increment clan treasury
      const updatedClan = await tx.clan.update({
        where: { id: company.clanId! },
        data: { treasury: { increment: amount } }
      });

      return { updatedCompany, updatedClan };
    });

    // Notify company of balance change
    GameWebSocketServer.sendToCompany(companyId, 'company:balance_update', {
      legalBalance: parseFloat(result.updatedCompany.legalBalance.toFixed(2)),
      blackMarketBalance: parseFloat(result.updatedCompany.blackMarketBalance.toFixed(2)),
      message: `💸 FUND CONTRIBUTION: Contributed $${amount.toLocaleString()} BM Cash to the Clan Mutual Protection Fund.`,
    });

    // Notify clan members of treasury update
    GameWebSocketServer.broadcastToClan(company.clanId!, 'clan:treasury_update', {
      treasury: parseFloat(result.updatedClan.treasury.toFixed(2)),
      message: `💰 FUND UPDATE: ${company.name} contributed $${amount.toLocaleString()} to the Mutual Protection Fund.`,
    });

    // System message in chat
    const chatMsg = `💰 FUND CONTRIBUTION: ${company.name} contributed $${amount.toLocaleString()} to the Mutual Protection Fund.`;
    await ClanService.addChatMessage(company.clanId!, {
      senderId: 'SYSTEM',
      senderName: 'SYSTEM',
      text: chatMsg,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Contributed $${amount.toLocaleString()} successfully to the Protection Fund.`,
      treasury: parseFloat(result.updatedClan.treasury.toFixed(2)),
    });

  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/clan/protection-fund
 * Feature 50 — Clan Mutual Protection Fund Status
 */
router.get('/protection-fund', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { clan: true }
    });

    if (!company || !company.clan) {
      return res.status(400).json({ error: 'NO_CLAN', message: 'You are not in a clan.' });
    }

    res.json({
      treasury: parseFloat(company.clan.treasury.toFixed(2)),
      clanName: company.clan.name,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

export default router;
