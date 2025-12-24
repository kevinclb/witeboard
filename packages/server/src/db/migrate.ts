import { pool } from './client.js';

const SCHEMA = `
-- Boards table
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT
);

-- Add ownership columns (idempotent for existing deployments)
DO $$ 
BEGIN
  -- Add owner_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boards' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE boards ADD COLUMN owner_id TEXT;
  END IF;
  
  -- Add is_private column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boards' AND column_name = 'is_private'
  ) THEN
    ALTER TABLE boards ADD COLUMN is_private BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Index for listing user's boards (only private boards have owners)
CREATE INDEX IF NOT EXISTS idx_boards_owner 
ON boards(owner_id) WHERE owner_id IS NOT NULL;

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

-- Ensure global board exists (public, no owner)
INSERT INTO boards (id, name, is_private) 
VALUES ('global', 'Global Whiteboard', false) 
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
