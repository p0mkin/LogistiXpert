import dotenv from 'dotenv';
import path from 'path';

// Load .env from current directory or parent
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!process.env.DATABASE_URL) {
    console.warn('[Security Warning] DATABASE_URL is not defined in production environment! Using fallback connection.');
  }
  if (!process.env.JWT_SECRET) {
    console.warn('[Security Warning] JWT_SECRET is not defined in production environment! Using fallback security key.');
  }
} else if (process.env.NODE_ENV !== 'test') {
  if (!process.env.FORCE_SEED_SECRET) {
    throw new Error('[Security Error] FORCE_SEED_SECRET is required in non-production environments to secure the /force-seed endpoint.');
  }
}

export const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/truck_manager?schema=public',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-underworld-jwt-token-key-fallback',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  FORCE_SEED_SECRET: process.env.FORCE_SEED_SECRET,
};
