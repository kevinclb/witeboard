import { pool } from './client.js';

const SCHEMA = `
-- Boards table
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT
);

-- Drawing events table (append-only log)
CREATE TABLE IF NOT EXISTS drawing_events (
  board_id TEXT NOT NULL REFERENCES boards(id),
  seq BIGINT NOT NULL,
  event JSONB NOT NULL,
  PRIMARY KEY (board_id, seq)
);

-- Index for faster event replay
CREATE INDEX IF NOT EXISTS idx_drawing_events_board_seq 
ON drawing_events (board_id, seq);

-- Ensure global board exists
INSERT INTO boards (id, name) 
VALUES ('global', 'Global Whiteboard') 
ON CONFLICT (id) DO NOTHING;
`;

/**
 * Run database migrations
 * Safe to call multiple times (idempotent)
 */
export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  
  try {
    await pool.query(SCHEMA);
    console.log('✓ Database schema ready');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Run migrations as standalone script
 * Used for local development: pnpm db:migrate
 */
async function main() {
  try {
    await runMigrations();
    
    // Verify
    const result = await pool.query('SELECT id, name FROM boards');
    console.log('Boards:', result.rows);
  } finally {
    await pool.end();
  }
}

// Only run if this is the main module (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
