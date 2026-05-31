import { AuthenticatedWebSocket } from './index';
import { BorderActionSchema, makeErrorResponse } from './protocol';
import { BorderService } from '../services/border.service';

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

    try {
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
          
          ws.send(JSON.stringify({
            type: 'border:cleared',
            payload: {
              truckId,
              roll: result.roll,
              probability: result.detectionProbability,
              payout: successResult.payout,
              message: 'Customs cleared. Delivery completed successfully!',
            },
            replyTo: requestId,
          }));
        } else {
          // Busted: apply database penalties, impound vehicle
          const penalties = result.penalties!;
          await BorderService.applyBustPenalties(truckId, penalties);

          ws.send(JSON.stringify({
            type: 'border:bust',
            payload: {
              truckId,
              roll: result.roll,
              probability: result.detectionProbability,
              penalties,
              message: 'CONTRABAND DETECTED! Cargo seized and vehicle impounded.',
            },
            replyTo: requestId,
          }));
        }
      } else if (action === 'BRIBE') {
        const amount = bribeAmount || 2000; // default $2000 bribe
        const result = await BorderService.applyBribeAttempt(truckId, amount);

        if (result.success) {
          ws.send(JSON.stringify({
            type: 'border:bribe_success',
            payload: {
              truckId,
              bribeAmount: amount,
              roll: result.roll,
              chance: result.chance,
              payout: result.payout,
              message: `Bribe accepted successfully! Customs cleared, cargo delivered. Payout: $${result.payout} BM cash.`,
            },
            replyTo: requestId,
          }));
        } else {
          const penalties = result.penalties!;
          ws.send(JSON.stringify({
            type: 'border:bribe_fail',
            payload: {
              truckId,
              bribeAmount: amount,
              roll: result.roll,
              chance: result.chance,
              penalties,
              message: `Bribe rejected! The officer pocketed the $${amount} and called backup. Vehicle impounded!`,
            },
            replyTo: requestId,
          }));
        }
      } else if (action === 'RUN') {
        const result = await BorderService.applyBorderRun(truckId);

        if (result.success) {
          ws.send(JSON.stringify({
            type: 'border:run_success',
            payload: {
              truckId,
              roll: result.roll,
              chance: result.chance,
              payout: result.payout,
              message: `Breakout successful! You broke through the gates and delivered the cargo, but global Heat spiked! Payout: $${result.payout} BM.`,
            },
            replyTo: requestId,
          }));
        } else {
          const penalties = result.penalties!;
          ws.send(JSON.stringify({
            type: 'border:run_fail',
            payload: {
              truckId,
              roll: result.roll,
              chance: result.chance,
              damagePercent: result.damagePercent,
              penalties,
              message: `Gate run failed! Crashed into steel barricades taking ${result.damagePercent}% structural damage. Vehicle impounded!`,
            },
            replyTo: requestId,
          }));
        }
      }
    } catch (error: any) {
      ws.send(JSON.stringify(makeErrorResponse('ACTION_FAILED', error.message || 'Border action failed to execute', requestId)));
    }
  }
}
