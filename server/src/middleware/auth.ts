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

function isJWTPayloadValid(payload: any): payload is JWTPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof payload.id === 'string' &&
    typeof payload.username === 'string' &&
    typeof payload.companyId === 'string'
  );
}

// 1. REST Express Middleware
export function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token format' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !parts[1]) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token format' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);

    if (!isJWTPayloadValid(decoded)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid token payload' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Token expired or invalid' });
  }
}

// 2. WebSocket Raw Upgrade Handshake Verification
export function verifyWSHandshakeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    if (!isJWTPayloadValid(decoded)) {
      return null;
    }
    return decoded;
  } catch (error) {
    return null;
  }
}
