import pg from 'pg';
import type { DrawEvent, Board } from '@witeboard/shared';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://witeboard:witeboard@localhost:5433/witeboard',
});

/**
 * Board row from database
 */
interface BoardRow {
  id: string;
  created_at: Date;
  name: string | null;
  owner_id: string | null;
  is_private: boolean | null;
}

/**
 * Convert database row to Board type
 */
function rowToBoard(row: BoardRow): Board {
  return {
    id: row.id,
    createdAt: row.created_at.getTime(),
    name: row.name ?? undefined,
    ownerId: row.owner_id ?? undefined,
    isPrivate: row.is_private ?? false,
  };
}

/**
 * Get a board by ID
 */
export async function getBoard(boardId: string): Promise<Board | null> {
  const result = await pool.query<BoardRow>(
    `SELECT id, created_at, name, owner_id, is_private FROM boards WHERE id = $1`,
    [boardId]
  );
  return result.rows[0] ? rowToBoard(result.rows[0]) : null;
}

/**
 * Create a new board
 */
export async function createBoard(
  boardId: string, 
  name: string | undefined, 
  ownerId: string | undefined, 
  isPrivate: boolean
): Promise<Board> {
  const result = await pool.query<BoardRow>(
    `INSERT INTO boards (id, name, owner_id, is_private) 
     VALUES ($1, $2, $3, $4) 
     RETURNING id, created_at, name, owner_id, is_private`,
    [boardId, name ?? null, ownerId ?? null, isPrivate]
  );
  return rowToBoard(result.rows[0]);
}

/**
 * Get all boards owned by a user
 */
export async function getUserBoards(ownerId: string): Promise<Board[]> {
  const result = await pool.query<BoardRow>(
    `SELECT id, created_at, name, owner_id, is_private 
     FROM boards 
     WHERE owner_id = $1 
     ORDER BY created_at DESC`,
    [ownerId]
  );
  return result.rows.map(rowToBoard);
}

/**
 * Delete a board (owner only)
 */
export async function deleteBoard(boardId: string, ownerId: string): Promise<boolean> {
  // First delete all events for the board
  await pool.query(
    `DELETE FROM drawing_events WHERE board_id = $1`,
    [boardId]
  );
  
  // Then delete the board itself (only if owner matches)
  const result = await pool.query(
    `DELETE FROM boards WHERE id = $1 AND owner_id = $2`,
    [boardId, ownerId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Check if a user can access a board
 * Returns true for public boards or if user is the owner
 */
export async function canAccessBoard(boardId: string, userId: string | null): Promise<boolean> {
  const board = await getBoard(boardId);
  
  if (!board) {
    return false; // Board doesn't exist
  }
  
  if (!board.isPrivate) {
    return true; // Public board
  }
  
  // Private board - only owner can access
  return userId !== null && board.ownerId === userId;
}

/**
 * Ensure a board exists, creating it if necessary (for legacy/global board)
 */
export async function ensureBoardExists(boardId: string, name?: string): Promise<void> {
  await pool.query(
    `INSERT INTO boards (id, name, is_private) VALUES ($1, $2, false) ON CONFLICT (id) DO NOTHING`,
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
 * Get events for a board after a given sequence number (for delta sync)
 * Returns events where seq > fromSeq, ordered by seq ascending
 */
export async function getEventsFromSeq(boardId: string, fromSeq: number): Promise<DrawEvent[]> {
  const result = await pool.query<{ event: DrawEvent }>(
    `SELECT event FROM drawing_events WHERE board_id = $1 AND seq > $2 ORDER BY seq ASC`,
    [boardId, fromSeq]
  );
  return result.rows.map((row: { event: DrawEvent }) => row.event);
}

/**
 * Clear all events for a board (for testing/reset)
 */
export async function clearBoard(boardId: string): Promise<void> {
  await pool.query(`DELETE FROM drawing_events WHERE board_id = $1`, [boardId]);
}

// ============================================================================
// Snapshot Operations - For compacted canvas state
// ============================================================================

/**
 * Snapshot data from the database
 */
export interface Snapshot {
  boardId: string;
  seq: number;
  imageData: string;  // Base64-encoded PNG
  createdAt: Date;
}

/**
 * Get the latest snapshot for a board
 */
export async function getSnapshot(boardId: string): Promise<Snapshot | null> {
  const result = await pool.query<{
    board_id: string;
    seq: string;
    image_data: string;
    created_at: Date;
  }>(
    `SELECT board_id, seq, image_data, created_at 
     FROM board_snapshots 
     WHERE board_id = $1`,
    [boardId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    boardId: row.board_id,
    seq: parseInt(row.seq, 10),
    imageData: row.image_data,
    createdAt: row.created_at,
  };
}

/**
 * Save a snapshot for a board (upsert - replaces existing)
 */
export async function saveSnapshot(
  boardId: string,
  seq: number,
  imageData: string
): Promise<void> {
  await pool.query(
    `INSERT INTO board_snapshots (board_id, seq, image_data, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (board_id) 
     DO UPDATE SET seq = $2, image_data = $3, created_at = NOW()`,
    [boardId, seq, imageData]
  );
}

/**
 * Delete a snapshot for a board
 */
export async function deleteSnapshot(boardId: string): Promise<void> {
  await pool.query(`DELETE FROM board_snapshots WHERE board_id = $1`, [boardId]);
}

/**
 * Get events for a board after a snapshot sequence
 * Used for initial sync when a snapshot exists
 */
export async function getEventsAfterSnapshot(
  boardId: string,
  snapshotSeq: number
): Promise<DrawEvent[]> {
  const result = await pool.query<{ event: DrawEvent }>(
    `SELECT event FROM drawing_events 
     WHERE board_id = $1 AND seq > $2 
     ORDER BY seq ASC`,
    [boardId, snapshotSeq]
  );
  return result.rows.map((row) => row.event);
}

/**
 * Get event count for a board (for deciding when to compact)
 */
export async function getEventCount(boardId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM drawing_events WHERE board_id = $1`,
    [boardId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Get boards that need compaction (many events since last snapshot)
 */
export async function getBoardsNeedingCompaction(
  eventThreshold: number = 5000
): Promise<{ boardId: string; eventCount: number; snapshotSeq: number | null }[]> {
  const result = await pool.query<{
    board_id: string;
    event_count: string;
    snapshot_seq: string | null;
  }>(
    `SELECT 
       b.id as board_id,
       COUNT(e.seq) as event_count,
       s.seq as snapshot_seq
     FROM boards b
     LEFT JOIN drawing_events e ON e.board_id = b.id
     LEFT JOIN board_snapshots s ON s.board_id = b.id
     GROUP BY b.id, s.seq
     HAVING COUNT(e.seq) - COALESCE(s.seq, 0) > $1`,
    [eventThreshold]
  );

  return result.rows.map((row) => ({
    boardId: row.board_id,
    eventCount: parseInt(row.event_count, 10),
    snapshotSeq: row.snapshot_seq ? parseInt(row.snapshot_seq, 10) : null,
  }));
}

/**
 * Close the database pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };

