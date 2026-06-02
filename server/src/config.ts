import dotenv from 'dotenv';
import path from 'path';

// Load .env from current directory or parent
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const isProduction = process.env.NODE_ENV === 'production';

export const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL || (isProduction
    ? (() => { throw new Error('DATABASE_URL environment variable is required in production.'); })()
    : 'postgresql://postgres:postgres@localhost:5432/truck_manager?schema=public'),
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  JWT_SECRET: process.env.JWT_SECRET || (isProduction
    ? (() => { throw new Error('JWT_SECRET environment variable is required in production.'); })()
    : 'dev-underworld-jwt-token-key-fallback'),
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
};
