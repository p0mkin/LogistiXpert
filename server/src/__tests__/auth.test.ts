import jwt from 'jsonwebtoken';
import { verifyWSHandshakeToken } from '../middleware/auth';
import { CONFIG } from '../config';

describe('Auth Middleware - verifyWSHandshakeToken', () => {
  const mockPayload = {
    id: 'user-123',
    username: 'testuser',
    companyId: 'company-456'
  };

  it('should return decoded payload for a valid token', () => {
    const token = jwt.sign(mockPayload, CONFIG.JWT_SECRET);
    const result = verifyWSHandshakeToken(token);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(mockPayload.id);
    expect(result?.username).toBe(mockPayload.username);
    expect(result?.companyId).toBe(mockPayload.companyId);
  });

  it('should return null for an invalid token', () => {
    const token = 'invalid.token.string';
    const result = verifyWSHandshakeToken(token);
    expect(result).toBeNull();
  });

  it('should return null for an expired token', () => {
    const token = jwt.sign(mockPayload, CONFIG.JWT_SECRET, { expiresIn: '-1s' });
    const result = verifyWSHandshakeToken(token);
    expect(result).toBeNull();
  });

  it('should return null for an empty token', () => {
    const result = verifyWSHandshakeToken('');
    expect(result).toBeNull();
  });

  it('should return null if token is signed with a different secret', () => {
    const token = jwt.sign(mockPayload, 'different-secret');
    const result = verifyWSHandshakeToken(token);
    expect(result).toBeNull();
  });
});
