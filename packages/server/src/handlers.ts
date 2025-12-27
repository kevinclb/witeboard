import type { WebSocket } from 'ws';
import type {
  ClientMessage,
  HelloMessage,
  DrawEventMessage,
  CursorMoveMessage,
  CreateBoardMessage,
  ServerMessage,
  CursorData,
} from '@witeboard/shared';
import { generateUUID } from '@witeboard/shared';
import {
  resolveIdentity,
  joinBoard,
  leaveBoard,
  updateCursor,
  getBoardClients,
  getBoardPresence,
  getConnectionBoard,
  getConnectionIdentity,
  queueCursorUpdate,
  setCursorBatchBroadcaster,
} from './presence.js';
import { sequenceEvent, initBoardSequence, getCurrentSeq } from './sequencer.js';
import { 
  getEvents, 
  getEventsFromSeq, 
  getMaxSeq, 
  ensureBoardExists, 
  getBoard, 
  createBoard, 
  canAccessBoard,
  getSnapshot,
  saveSnapshot,
  getEventsAfterSnapshot,
} from './db/client.js';
import { verifyClerkToken } from './auth.js';
import { renderEventsToSnapshot } from './snapshot.js';
import { checkDrawLimit, checkCursorLimit } from './rate-limiter.js';

// Compaction settings
const COMPACTION_THRESHOLD = 5000;  // Create snapshot every 5000 events

// Track ongoing compactions to avoid duplicates
const compactionInProgress = new Set<string>();

/**
 * Check if a board should be compacted and trigger if needed
 * Runs asynchronously, non-blocking
 */
async function maybeCompactBoard(boardId: string, currentSeq: number): Promise<void> {
  // Only compact at threshold intervals
  if (currentSeq % COMPACTION_THRESHOLD !== 0) {
    return;
  }

  // Avoid duplicate compactions
  if (compactionInProgress.has(boardId)) {
    return;
  }

  try {
    compactionInProgress.add(boardId);
    console.log(`Starting compaction for board ${boardId} at seq ${currentSeq}...`);

    // Get all events up to current seq
    const events = await getEvents(boardId);
    
    if (events.length < COMPACTION_THRESHOLD) {
      console.log(`Skipping compaction: only ${events.length} events`);
      return;
    }

    // Render to snapshot
    const startTime = Date.now();
    const snapshotResult = renderEventsToSnapshot(events);
    const renderTime = Date.now() - startTime;

    // Save snapshot with offset info
    await saveSnapshot(boardId, currentSeq, snapshotResult.imageData, snapshotResult.offsetX, snapshotResult.offsetY);
    
    const sizeKB = Math.round(snapshotResult.imageData.length / 1024);
    console.log(`Compaction complete for ${boardId}: ${events.length} events -> ${sizeKB}KB snapshot (${renderTime}ms render)`);
  } finally {
    compactionInProgress.delete(boardId);
  }
}

/**
 * Send a message to a single client
 */
function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Broadcast a message to all clients in a board except the sender
 */
function broadcast(boardId: string, message: ServerMessage, excludeWs?: WebSocket): void {
  const clients = getBoardClients(boardId);
  const data = JSON.stringify(message);
  
  for (const client of clients) {
    if (client !== excludeWs && client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

/**
 * Broadcast a message to ALL clients in a board (including sender)
 */
function broadcastAll(boardId: string, message: ServerMessage): void {
  const clients = getBoardClients(boardId);
  const data = JSON.stringify(message);
  
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

/**
 * Broadcast a batched cursor update to all clients in a board
 */
function broadcastCursorBatch(boardId: string, cursors: CursorData[]): void {
  const clients = getBoardClients(boardId);
  const data = JSON.stringify({
    type: 'CURSOR_BATCH',
    payload: { boardId, cursors },
  });
  
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

// Initialize cursor batch broadcaster
setCursorBatchBroadcaster(broadcastCursorBatch);

/**
 * Handle HELLO message - join board and sync state
 */
async function handleHello(ws: WebSocket, message: HelloMessage): Promise<void> {
  const { boardId, authToken, clientId, displayName, isAnonymous, resumeFromSeq } = message.payload;

  console.log(`HELLO from client: boardId=${boardId}, clientId=${clientId}, resumeFromSeq=${resumeFromSeq ?? 'none'}`);

  try {
    // Verify Clerk token if provided
    const clerkUserId = await verifyClerkToken(authToken);
    
    // Check if board exists and get its details
    let board = await getBoard(boardId);
    
    if (!board) {
      // Board doesn't exist - create it as public if it's not a valid UUID
      // (legacy behavior for global board and direct URL access)
      await ensureBoardExists(boardId);
      board = await getBoard(boardId);
    }
    
    // Check access for private boards
    if (board && board.isPrivate) {
      if (!clerkUserId) {
        // Not authenticated - deny access
        send(ws, {
          type: 'ACCESS_DENIED',
          payload: { 
            boardId, 
            reason: 'This is a private board. Please sign in to access it.' 
          },
        });
        return;
      }
      
      if (board.ownerId !== clerkUserId) {
        // Authenticated but not the owner
        send(ws, {
          type: 'ACCESS_DENIED',
          payload: { 
            boardId, 
            reason: 'This board is private. Only the owner can access it.' 
          },
        });
        return;
      }
    }
    
    // Initialize sequence counter
    await initBoardSequence(boardId);

    // Resolve identity (use Clerk user ID if available)
    const identity = resolveIdentity({ 
      clientId: clerkUserId || clientId, 
      displayName, 
      isAnonymous: !clerkUserId && isAnonymous 
    });

    // Join the board
    const presence = joinBoard(ws, boardId, identity);

    // Send WELCOME with assigned identity
    send(ws, {
      type: 'WELCOME',
      payload: {
        userId: identity.userId,
        displayName: identity.displayName,
        avatarColor: identity.avatarColor!,
      },
    });

    // Send SYNC_SNAPSHOT - with snapshot if available, delta if resumeFromSeq
    const isDelta = resumeFromSeq !== undefined && resumeFromSeq > 0;
    const lastSeq = await getMaxSeq(boardId);
    
    let events: Awaited<ReturnType<typeof getEvents>>;
    let snapshotData: { imageData: string; seq: number; offsetX: number; offsetY: number } | undefined;
    
    if (isDelta) {
      // Delta sync: only events after resumeFromSeq
      events = await getEventsFromSeq(boardId, resumeFromSeq);
      console.log(`Sending delta sync: ${events.length} events after seq ${resumeFromSeq}`);
    } else {
      // Full sync: check for snapshot first
      const snapshot = await getSnapshot(boardId);
      
      if (snapshot) {
        // Use snapshot + events after snapshot
        events = await getEventsAfterSnapshot(boardId, snapshot.seq);
        snapshotData = { 
          imageData: snapshot.imageData, 
          seq: snapshot.seq,
          offsetX: snapshot.offsetX,
          offsetY: snapshot.offsetY,
        };
        console.log(`Sending snapshot sync: snapshot@${snapshot.seq} + ${events.length} events (lastSeq=${lastSeq})`);
      } else {
        // No snapshot: send all events
        events = await getEvents(boardId);
        console.log(`Sending full sync: ${events.length} events (no snapshot, lastSeq=${lastSeq})`);
      }
    }
    
    send(ws, {
      type: 'SYNC_SNAPSHOT',
      payload: { boardId, events, lastSeq, isDelta, snapshot: snapshotData },
    });

    // Send USER_LIST to the joining client
    const users = getBoardPresence(boardId);
    send(ws, {
      type: 'USER_LIST',
      payload: { boardId, users },
    });

    // Broadcast USER_JOIN to others
    broadcast(boardId, {
      type: 'USER_JOIN',
      payload: { boardId, user: presence },
    }, ws);

    console.log(`Client ${identity.displayName} joined board ${boardId}`);
  } catch (error) {
    console.error('Error handling HELLO:', error);
    send(ws, {
      type: 'ERROR',
      payload: { code: 'JOIN_FAILED', message: 'Failed to join board' },
    });
  }
}

/**
 * Handle DRAW_EVENT message - sequence, persist, broadcast
 */
async function handleDrawEvent(ws: WebSocket, message: DrawEventMessage): Promise<void> {
  // Rate limit check - silently drop if exceeded
  if (!checkDrawLimit(ws)) {
    return;
  }

  const boardId = getConnectionBoard(ws);
  const identity = getConnectionIdentity(ws);

  if (!boardId || !identity) {
    send(ws, {
      type: 'ERROR',
      payload: { code: 'NOT_JOINED', message: 'Must send HELLO first' },
    });
    return;
  }

  try {
    // Sequence and persist the event
    const event = await sequenceEvent(
      boardId,
      identity.userId,
      message.payload.type,
      message.payload.payload
    );

    // Broadcast to ALL clients (including sender for reconciliation)
    broadcastAll(boardId, {
      type: 'DRAW_EVENT',
      payload: event,
    });

    // Check if we should trigger compaction (async, non-blocking)
    maybeCompactBoard(boardId, event.seq).catch((err) => {
      console.error('Compaction error:', err);
    });
  } catch (error) {
    console.error('Error handling DRAW_EVENT:', error);
    send(ws, {
      type: 'ERROR',
      payload: { code: 'DRAW_FAILED', message: 'Failed to process draw event' },
    });
  }
}

/**
 * Handle CURSOR_MOVE message - update presence and queue for batched broadcast
 */
function handleCursorMove(ws: WebSocket, message: CursorMoveMessage): void {
  // Rate limit check - silently drop if exceeded
  if (!checkCursorLimit(ws)) {
    return;
  }

  const result = updateCursor(ws, message.payload.x, message.payload.y);

  if (!result) {
    return; // Not joined, ignore
  }

  // Queue for batched broadcast (instead of immediate N^2 broadcast)
  queueCursorUpdate(
    result.boardId,
    result.userId,
    result.displayName,
    result.avatarColor,
    message.payload.x,
    message.payload.y
  );
}

/**
 * Handle CREATE_BOARD message - create a new board
 */
async function handleCreateBoard(ws: WebSocket, message: CreateBoardMessage): Promise<void> {
  const { name, isPrivate, clerkToken } = message.payload;

  console.log(`CREATE_BOARD request: name=${name}, isPrivate=${isPrivate}, hasToken=${!!clerkToken}`);

  try {
    // Verify Clerk token - must be signed in to create boards
    const clerkUserId = await verifyClerkToken(clerkToken);
    
    if (!clerkUserId) {
      send(ws, {
        type: 'ERROR',
        payload: { 
          code: 'UNAUTHORIZED', 
          message: 'You must be signed in to create a board' 
        },
      });
      return;
    }

    // Generate a unique board ID
    const boardId = generateUUID();

    // Create the board
    await createBoard(boardId, name, clerkUserId, isPrivate);
    
    // Initialize sequence counter
    await initBoardSequence(boardId);

    console.log(`Board created: id=${boardId}, owner=${clerkUserId}, private=${isPrivate}`);

    // Send success response
    send(ws, {
      type: 'BOARD_CREATED',
      payload: {
        boardId,
        name,
        isPrivate,
      },
    });
  } catch (error) {
    console.error('Error creating board:', error);
    send(ws, {
      type: 'ERROR',
      payload: { code: 'CREATE_FAILED', message: 'Failed to create board' },
    });
  }
}

/**
 * Handle client disconnect
 */
export function handleDisconnect(ws: WebSocket): void {
  const result = leaveBoard(ws);

  if (result) {
    // Broadcast USER_LEAVE to remaining clients
    broadcast(result.boardId, {
      type: 'USER_LEAVE',
      payload: {
        boardId: result.boardId,
        userId: result.userId,
      },
    });
    console.log(`Client ${result.userId} left board ${result.boardId}`);
  }
}

/**
 * Route incoming messages to handlers
 */
export async function handleMessage(ws: WebSocket, data: string): Promise<void> {
  let message: ClientMessage;

  try {
    message = JSON.parse(data) as ClientMessage;
  } catch {
    send(ws, {
      type: 'ERROR',
      payload: { code: 'INVALID_JSON', message: 'Invalid JSON message' },
    });
    return;
  }

  switch (message.type) {
    case 'HELLO':
      await handleHello(ws, message);
      break;
    case 'DRAW_EVENT':
      await handleDrawEvent(ws, message);
      break;
    case 'CURSOR_MOVE':
      handleCursorMove(ws, message);
      break;
    case 'PING':
      send(ws, { type: 'PONG' });
      break;
    case 'LEAVE_BOARD':
      handleDisconnect(ws);
      break;
    case 'CREATE_BOARD':
      await handleCreateBoard(ws, message);
      break;
    default:
      send(ws, {
        type: 'ERROR',
        payload: { code: 'UNKNOWN_MESSAGE', message: `Unknown message type` },
      });
  }
}

