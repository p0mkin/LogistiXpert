import { AuthenticatedWebSocket, GameWebSocketServer } from './index';
import { BorderActionSchema, makeErrorResponse } from './protocol';
import { BorderService } from '../services/border.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class BorderSocketHandler {
  static async handleClearance(ws: AuthenticatedWebSocket, payload: any, requestId?: string) {
    if (!ws.user) {
      ws.send(JSON.stringify(makeErrorResponse('AUTH_REQUIRED', 'Player must be authenticated', requestId)));
      return;
    }

    const parsed = BorderActionSchema.safeParse(payload);
    if (!parsed.success) {
      ws.send(JSON.stringify(makeErrorResponse('INVALID_PAYLOAD', 'Required parameters missing or invalid', requestId)));
      return;
    }

    const { truckId, action, bribeAmount } = parsed.data;
    const companyId = ws.user.companyId;

    try {
      // 1. Verify company ownership of the vehicle
      const truck = await prisma.truck.findUnique({ where: { id: truckId } });
      if (!truck || truck.companyId !== companyId) {
        ws.send(JSON.stringify(makeErrorResponse('TRUCK_NOT_FOUND', 'Vehicle does not exist in your company fleet', requestId)));
        return;
      }

      if (action === 'CLEARANCE') {
        // Run standard scanning crossing calculation
        // Simulate a checkpoint: e.g., entering non-Schengen territory (Belarus or similar border)
        const checkpoint = {
          name: 'Brest Border Terminal',
          alertLevel: 4, // 1 to 10 severity
          scannerType: 'XRAY' as const,
          hasK9: true,
        };

        const result = await BorderService.calculateClearance(truckId, checkpoint);

        if (result.cleared) {
          // Success: trigger payouts & mileage increases
          const successResult = await BorderService.applyClearanceSuccess(truckId);
          
          const successPayload = {
            truckId,
            roll: result.roll,
            probability: result.detectionProbability,
            payout: successResult.payout,
            message: 'Customs cleared. Delivery completed successfully!',
          };

          // Send success receipt back to the sender
          ws.send(JSON.stringify({
            type: 'border:cleared',
            payload: successPayload,
            replyTo: requestId,
          }));

          // Send update to other co-op players in the same company
          GameWebSocketServer.sendToCompany(companyId, 'border:cleared', successPayload);
        } else {
          // Busted: apply database penalties, impound vehicle
          const penalties = result.penalties!;
          await BorderService.applyBustPenalties(truckId, penalties);

          const bustPayload = {
            truckId,
            roll: result.roll,
            probability: result.detectionProbability,
            penalties,
            message: 'CONTRABAND DETECTED! Cargo seized and vehicle impounded.',
          };

          // Send receipt back to the sender
          ws.send(JSON.stringify({
            type: 'border:bust',
            payload: bustPayload,
            replyTo: requestId,
          }));

          // Send update to other co-op players in the company
          GameWebSocketServer.sendToCompany(companyId, 'border:bust', bustPayload);
        }
      } else if (action === 'BRIBE') {
        const amount = bribeAmount || 2000; // default $2000 bribe
        const result = await BorderService.applyBribeAttempt(truckId, amount);

        if (result.success) {
          const bribeSuccessPayload = {
            truckId,
            bribeAmount: amount,
            roll: result.roll,
            chance: result.chance,
            payout: result.payout,
            message: `Bribe accepted successfully! Customs cleared, cargo delivered. Payout: $${result.payout} BM cash.`,
          };

          ws.send(JSON.stringify({
            type: 'border:bribe_success',
            payload: bribeSuccessPayload,
            replyTo: requestId,
          }));

          GameWebSocketServer.sendToCompany(companyId, 'border:bribe_success', bribeSuccessPayload);
        } else {
          const penalties = result.penalties!;
          const bribeFailPayload = {
            truckId,
            bribeAmount: amount,
            roll: result.roll,
            chance: result.chance,
            penalties,
            message: `Bribe rejected! The officer pocketed the $${amount} and called backup. Vehicle impounded!`,
          };

          ws.send(JSON.stringify({
            type: 'border:bribe_fail',
            payload: bribeFailPayload,
            replyTo: requestId,
          }));

          GameWebSocketServer.sendToCompany(companyId, 'border:bribe_fail', bribeFailPayload);
        }
      } else if (action === 'RUN') {
        const result = await BorderService.applyBorderRun(truckId);

        if (result.success) {
          const runSuccessPayload = {
            truckId,
            roll: result.roll,
            chance: result.chance,
            payout: result.payout,
            message: `Breakout successful! You broke through the gates and delivered the cargo, but global Heat spiked! Payout: $${result.payout} BM.`,
          };

          ws.send(JSON.stringify({
            type: 'border:run_success',
            payload: runSuccessPayload,
            replyTo: requestId,
          }));

          GameWebSocketServer.sendToCompany(companyId, 'border:run_success', runSuccessPayload);
        } else {
          const penalties = result.penalties!;
          const runFailPayload = {
            truckId,
            roll: result.roll,
            chance: result.chance,
            damagePercent: result.damagePercent,
            penalties,
            message: `Gate run failed! Crashed into steel barricades taking ${result.damagePercent}% structural damage. Vehicle impounded!`,
          };

          ws.send(JSON.stringify({
            type: 'border:run_fail',
            payload: runFailPayload,
            replyTo: requestId,
          }));

          GameWebSocketServer.sendToCompany(companyId, 'border:run_fail', runFailPayload);
        }
      }
    } catch (error: any) {
      ws.send(JSON.stringify(makeErrorResponse('ACTION_FAILED', error.message || 'Border action failed to execute', requestId)));
    }
  }
}
