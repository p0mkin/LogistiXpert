import { z } from 'zod';

// ==========================================
// 1. ONEWAY / CLIENT PAYLOAD SCHEMAS
// ==========================================
export const AuthPayloadSchema = z.object({
  token: z.string(),
});

export const PlaceBidSchema = z.object({
  auctionId: z.string(),
  amount: z.number().positive(),
});

export const BorderActionSchema = z.object({
  truckId: z.string(),
  action: z.enum(['CLEARANCE', 'BRIBE', 'RUN']),
  bribeAmount: z.number().positive().optional(),
});

// ==========================================
// 2. DISPATCH EVENT UNION
// ==========================================
export const WSMessageSchema = z.object({
  type: z.string(),
  payload: z.any(),
  requestId: z.string().optional(),
});

export type WSMessage = z.infer<typeof WSMessageSchema>;

export interface ServerResponse {
  type: string;
  payload: any;
  replyTo?: string;
}

// Error payload response helper
export function makeErrorResponse(code: string, message: string, requestId?: string): ServerResponse {
  return {
    type: 'error',
    payload: { code, message },
    replyTo: requestId,
  };
}
