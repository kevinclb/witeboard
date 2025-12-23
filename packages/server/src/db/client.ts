import pg from 'pg';
import type { DrawEvent } from '@witeboard/shared';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://witeboard:witeboard@localhost:5433/witeboard',
});

/**
 * Ensure a board exists, creating it if necessary
 */
export async function ensureBoardExists(boardId: string, name?: string): Promise<void> {
  await pool.query(
    `INSERT INTO boards (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
    [boardId, name || null]
  );
}

/**
 * Get the next sequence number for a board
 */
export async function getMaxSeq(boardId: string): Promise<number> {
  const result = await pool.query<{ max: string | null }>(
    `SELECT MAX(seq) as max FROM drawing_events WHERE board_id = $1`,
    [boardId]
  );
  return result.rows[0]?.max ? parseInt(result.rows[0].max, 10) : 0;
}

/**
 * Append a drawing event to the log
 */
export async function appendEvent(event: DrawEvent): Promise<void> {
  await pool.query(
    `INSERT INTO drawing_events (board_id, seq, event) VALUES ($1, $2, $3)`,
    [event.boardId, event.seq, JSON.stringify(event)]
  );
}

/**
 * Get all events for a board in order
 */
export async function getEvents(boardId: string): Promise<DrawEvent[]> {
  const result = await pool.query<{ event: DrawEvent }>(
    `SELECT event FROM drawing_events WHERE board_id = $1 ORDER BY seq ASC`,
    [boardId]
  );
  return result.rows.map((row: { event: DrawEvent }) => row.event);
}

/**
 * Clear all events for a board (for testing/reset)
 */
export async function clearBoard(boardId: string): Promise<void> {
  await pool.query(`DELETE FROM drawing_events WHERE board_id = $1`, [boardId]);
}

/**
 * Close the database pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };

