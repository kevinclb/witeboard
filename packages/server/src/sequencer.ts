import type { DrawEvent, DrawEventPayload } from '@witeboard/shared';
import { getMaxSeq, appendEvent } from './db/client.js';

/**
 * Event Sequencer - Maintains authoritative ordering per board
 * 
 * The server assigns the only authoritative order per board.
 * This is the core invariant of the system.
 */

// In-memory sequence counters per board
const nextSeq = new Map<string, number>();

/**
 * Initialize sequence counter for a board from database
 */
export async function initBoardSequence(boardId: string): Promise<void> {
  if (!nextSeq.has(boardId)) {
    const maxSeq = await getMaxSeq(boardId);
    nextSeq.set(boardId, maxSeq + 1);
    console.log(`Initialized sequence for board ${boardId}: next=${maxSeq + 1}`);
  }
}

/**
 * Assign sequence number and persist a draw event
 * Returns the complete event with server-assigned fields
 */
export async function sequenceEvent(
  boardId: string,
  userId: string,
  type: 'stroke' | 'clear',
  payload: DrawEventPayload
): Promise<DrawEvent> {
  // Ensure sequence is initialized
  await initBoardSequence(boardId);

  // Assign sequence number
  const seq = nextSeq.get(boardId)!;
  nextSeq.set(boardId, seq + 1);

  // Create the authoritative event
  const event: DrawEvent = {
    boardId,
    seq,
    type,
    userId,
    timestamp: Date.now(),
    payload,
  };

  // Persist to database
  await appendEvent(event);

  return event;
}

/**
 * Get current sequence number for a board (for debugging)
 */
export function getCurrentSeq(boardId: string): number | undefined {
  return nextSeq.get(boardId);
}

