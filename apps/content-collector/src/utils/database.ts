/**
 * Database Connection
 */

import pg from 'pg';
const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('📦 Database connected');
});

pool.on('error', (err) => {
  console.error('Database error:', err);
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end();
});
