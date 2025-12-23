import type { WebSocket } from 'ws';
import type {
  ClientMessage,
  HelloMessage,
  DrawEventMessage,
  CursorMoveMessage,
  ServerMessage,
  DrawEventType,
  DrawEventPayload,
} from '@witeboard/shared';
import {
  resolveIdentity,
  joinBoard,
  leaveBoard,
  updateCursor,
  getBoardClients,
  getBoardPresence,
  getConnectionBoard,
  getConnectionIdentity,
} from './presence.js';
import { sequenceEvent, initBoardSequence } from './sequencer.js';
import { getEvents, ensureBoardExists } from './db/client.js';

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
 * Handle HELLO message - join board and sync state
 */
async function handleHello(ws: WebSocket, message: HelloMessage): Promise<void> {
  const { boardId, clientId, displayName, isAnonymous } = message.payload;

  console.log(`HELLO from client: boardId=${boardId}, clientId=${clientId}`);

  try {
    // Ensure board exists
    await ensureBoardExists(boardId);
    
    // Initialize sequence counter
    await initBoardSequence(boardId);

    // Resolve identity
    const identity = resolveIdentity({ clientId, displayName, isAnonymous });

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

    // Send SYNC_SNAPSHOT with all events
    const events = await getEvents(boardId);
    send(ws, {
      type: 'SYNC_SNAPSHOT',
      payload: { boardId, events },
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
  } catch (error) {
    console.error('Error handling DRAW_EVENT:', error);
    send(ws, {
      type: 'ERROR',
      payload: { code: 'DRAW_FAILED', message: 'Failed to process draw event' },
    });
  }
}

/**
 * Handle CURSOR_MOVE message - update presence and broadcast
 */
function handleCursorMove(ws: WebSocket, message: CursorMoveMessage): void {
  const result = updateCursor(ws, message.payload.x, message.payload.y);

  if (!result) {
    return; // Not joined, ignore
  }

  // Broadcast to others
  broadcast(result.boardId, {
    type: 'CURSOR_MOVE',
    payload: {
      boardId: result.boardId,
      userId: result.userId,
      displayName: result.displayName,
      avatarColor: result.avatarColor,
      x: message.payload.x,
      y: message.payload.y,
    },
  }, ws);
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
    default:
      send(ws, {
        type: 'ERROR',
        payload: { code: 'UNKNOWN_MESSAGE', message: `Unknown message type` },
      });
  }
}

