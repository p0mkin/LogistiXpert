import { z } from 'zod';
export declare const AuthPayloadSchema: z.ZodObject<{
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    token: string;
}, {
    token: string;
}>;
export declare const PlaceBidSchema: z.ZodObject<{
    auctionId: z.ZodString;
    amount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    auctionId: string;
    amount: number;
}, {
    auctionId: string;
    amount: number;
}>;
export declare const BorderActionSchema: z.ZodObject<{
    truckId: z.ZodString;
    action: z.ZodEnum<["CLEARANCE", "BRIBE", "RUN"]>;
    bribeAmount: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    truckId: string;
    action: "CLEARANCE" | "BRIBE" | "RUN";
    bribeAmount?: number | undefined;
}, {
    truckId: string;
    action: "CLEARANCE" | "BRIBE" | "RUN";
    bribeAmount?: number | undefined;
}>;
export declare const WSMessageSchema: z.ZodObject<{
    type: z.ZodString;
    payload: z.ZodAny;
    requestId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: string;
    payload?: any;
    requestId?: string | undefined;
}, {
    type: string;
    payload?: any;
    requestId?: string | undefined;
}>;
export type WSMessage = z.infer<typeof WSMessageSchema>;
export interface ServerResponse {
    type: string;
    payload: any;
    replyTo?: string;
}
export declare function makeErrorResponse(code: string, message: string, requestId?: string): ServerResponse;
