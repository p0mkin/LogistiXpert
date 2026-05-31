import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    companyId: string;
  };
}

export interface JWTPayload {
  id: string;
  username: string;
  companyId: string;
}

// 1. REST Express Middleware
export function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token format' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as JWTPayload;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Token expired or invalid' });
  }
}

// 2. WebSocket Raw Upgrade Handshake Verification
export function verifyWSHandshakeToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, CONFIG.JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}
