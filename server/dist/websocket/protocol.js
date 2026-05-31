"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSMessageSchema = exports.BorderActionSchema = exports.PlaceBidSchema = exports.AuthPayloadSchema = void 0;
exports.makeErrorResponse = makeErrorResponse;
const zod_1 = require("zod");
// ==========================================
// 1. ONEWAY / CLIENT PAYLOAD SCHEMAS
// ==========================================
exports.AuthPayloadSchema = zod_1.z.object({
    token: zod_1.z.string(),
});
exports.PlaceBidSchema = zod_1.z.object({
    auctionId: zod_1.z.string(),
    amount: zod_1.z.number().positive(),
});
exports.BorderActionSchema = zod_1.z.object({
    truckId: zod_1.z.string(),
    action: zod_1.z.enum(['CLEARANCE', 'BRIBE', 'RUN']),
    bribeAmount: zod_1.z.number().positive().optional(),
});
// ==========================================
// 2. DISPATCH EVENT UNION
// ==========================================
exports.WSMessageSchema = zod_1.z.object({
    type: zod_1.z.string(),
    payload: zod_1.z.any(),
    requestId: zod_1.z.string().optional(),
});
// Error payload response helper
function makeErrorResponse(code, message, requestId) {
    return {
        type: 'error',
        payload: { code, message },
        replyTo: requestId,
    };
}
