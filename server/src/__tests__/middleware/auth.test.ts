import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateJWT, verifyWSHandshakeToken, AuthRequest } from '../../middleware/auth';
import { CONFIG } from '../../config';

jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticateJWT', () => {
    it('should return 401 if authorization header is missing', () => {
      authenticateJWT(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid token format',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 if authorization format is invalid (no Bearer)', () => {
      mockRequest.headers = { authorization: 'Token somedummytoken' };

      authenticateJWT(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid token format',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 if header has Bearer but missing token (e.g. "Bearer ")', () => {
      mockRequest.headers = { authorization: 'Bearer ' };

      authenticateJWT(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid token format',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 if header has extra parts (e.g. "Bearer token extra")', () => {
      mockRequest.headers = { authorization: 'Bearer token extra' };

      authenticateJWT(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid token format',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 403 if token is expired or invalid', () => {
      mockRequest.headers = { authorization: 'Bearer invalidtoken' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      authenticateJWT(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(jwt.verify).toHaveBeenCalledWith('invalidtoken', CONFIG.JWT_SECRET);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'Token expired or invalid',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 403 if token is valid but payload is missing required properties', () => {
      mockRequest.headers = { authorization: 'Bearer validtoken' };
      (jwt.verify as jest.Mock).mockReturnValue({
        id: 'user123',
        // username is missing
        companyId: 'company456',
      });

      authenticateJWT(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(jwt.verify).toHaveBeenCalledWith('validtoken', CONFIG.JWT_SECRET);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'Invalid token payload',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should call next() and populate req.user if token and payload are valid', () => {
      mockRequest.headers = { authorization: 'Bearer validtoken' };
      const validPayload = {
        id: 'user123',
        username: 'testuser',
        companyId: 'company456',
      };
      (jwt.verify as jest.Mock).mockReturnValue(validPayload);

      authenticateJWT(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(jwt.verify).toHaveBeenCalledWith('validtoken', CONFIG.JWT_SECRET);
      expect(mockRequest.user).toEqual(validPayload);
      expect(nextFunction).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('verifyWSHandshakeToken', () => {
    it('should return null if token is expired or invalid', () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const result = verifyWSHandshakeToken('invalidtoken');

      expect(jwt.verify).toHaveBeenCalledWith('invalidtoken', CONFIG.JWT_SECRET);
      expect(result).toBeNull();
    });

    it('should return null if token is valid but payload is missing required properties', () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        id: 'user123',
        // username is missing
        companyId: 'company456',
      });

      const result = verifyWSHandshakeToken('validtoken');

      expect(jwt.verify).toHaveBeenCalledWith('validtoken', CONFIG.JWT_SECRET);
      expect(result).toBeNull();
    });

    it('should return decoded payload if token and payload are valid', () => {
      const validPayload = {
        id: 'user123',
        username: 'testuser',
        companyId: 'company456',
      };
      (jwt.verify as jest.Mock).mockReturnValue(validPayload);

      const result = verifyWSHandshakeToken('validtoken');

      expect(jwt.verify).toHaveBeenCalledWith('validtoken', CONFIG.JWT_SECRET);
      expect(result).toEqual(validPayload);
    });
  });
});
