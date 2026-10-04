import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not defined in environment variables. Falling back to local mock state.');
}

const dbUrl = process.env.DATABASE_URL || 'postgresql://placeholder@localhost/neondb';
export const sql = neon(dbUrl);
