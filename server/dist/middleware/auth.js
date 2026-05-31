"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = authenticateJWT;
exports.verifyWSHandshakeToken = verifyWSHandshakeToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
// 1. REST Express Middleware
function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token format' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.CONFIG.JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Token expired or invalid' });
    }
}
// 2. WebSocket Raw Upgrade Handshake Verification
function verifyWSHandshakeToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, config_1.CONFIG.JWT_SECRET);
    }
    catch (error) {
        return null;
    }
}
