import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: {
        id: string;
        username: string;
    };
}
export interface JWTPayload {
    id: string;
    username: string;
}
export declare function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function verifyWSHandshakeToken(token: string): JWTPayload | null;
