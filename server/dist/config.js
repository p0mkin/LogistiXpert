"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env from current directory or parent
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
exports.CONFIG = {
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/truck_manager?schema=public',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    PORT: parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || '0.0.0.0',
    JWT_SECRET: process.env.JWT_SECRET || 'super-secret-underworld-logistics-key-change-in-production',
    JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
};
