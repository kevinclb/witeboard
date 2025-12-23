import type { WebSocket } from 'ws';
import type { PresenceState, UserIdentity } from '@witeboard/shared';
import { generateAnonymousName, generateAvatarColor, generateUUID } from '@witeboard/shared';

/**
 * Presence Manager - Tracks users and connections per board
 */

// Connection state maps
const connectionToUser = new Map<WebSocket, UserIdentity>();
const connectionToBoard = new Map<WebSocket, string>();
const clientsByBoard = new Map<string, Set<WebSocket>>();
const presenceByBoard = new Map<string, Map<string, PresenceState>>();

/**
 * Create or restore user identity from HELLO payload
 */
export function resolveIdentity(payload: {
  clientId?: string;
  displayName?: string;
  isAnonymous: boolean;
}): UserIdentity {
  const userId = payload.clientId || generateUUID();
  const displayName = payload.displayName || generateAnonymousName();
  const avatarColor = generateAvatarColor(userId);

  return {
    userId,
    displayName,
    isAnonymous: payload.isAnonymous,
    avatarColor,
  };
}

/**
 * Add a connection to a board room
 */
export function joinBoard(ws: WebSocket, boardId: string, identity: UserIdentity): PresenceState {
  // Store connection mappings
  connectionToUser.set(ws, identity);
  connectionToBoard.set(ws, boardId);

  // Add to board clients
  if (!clientsByBoard.has(boardId)) {
    clientsByBoard.set(boardId, new Set());
  }
  clientsByBoard.get(boardId)!.add(ws);

  // Create presence state
  const presence: PresenceState = {
    boardId,
    userId: identity.userId,
    displayName: identity.displayName,
    isAnonymous: identity.isAnonymous,
    avatarColor: identity.avatarColor,
    connectedAt: Date.now(),
  };

  // Store presence
  if (!presenceByBoard.has(boardId)) {
    presenceByBoard.set(boardId, new Map());
  }
  presenceByBoard.get(boardId)!.set(identity.userId, presence);

  return presence;
}

/**
 * Remove a connection from its board
 */
export function leaveBoard(ws: WebSocket): { boardId: string; userId: string } | null {
  const identity = connectionToUser.get(ws);
  const boardId = connectionToBoard.get(ws);

  if (!identity || !boardId) {
    return null;
  }

  // Remove from board clients
  const clients = clientsByBoard.get(boardId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      clientsByBoard.delete(boardId);
    }
  }

  // Remove presence
  const presence = presenceByBoard.get(boardId);
  if (presence) {
    presence.delete(identity.userId);
    if (presence.size === 0) {
      presenceByBoard.delete(boardId);
    }
  }

  // Clean up connection maps
  connectionToUser.delete(ws);
  connectionToBoard.delete(ws);

  return { boardId, userId: identity.userId };
}

/**
 * Update cursor position for a user
 */
export function updateCursor(ws: WebSocket, x: number, y: number): {
  boardId: string;
  userId: string;
  displayName: string;
  avatarColor?: string;
} | null {
  const identity = connectionToUser.get(ws);
  const boardId = connectionToBoard.get(ws);

  if (!identity || !boardId) {
    return null;
  }

  const presence = presenceByBoard.get(boardId)?.get(identity.userId);
  if (presence) {
    presence.cursor = { x, y, t: Date.now() };
  }

  return {
    boardId,
    userId: identity.userId,
    displayName: identity.displayName,
    avatarColor: identity.avatarColor,
  };
}

/**
 * Get all clients for a board
 */
export function getBoardClients(boardId: string): Set<WebSocket> {
  return clientsByBoard.get(boardId) || new Set();
}

/**
 * Get all presence states for a board
 */
export function getBoardPresence(boardId: string): PresenceState[] {
  const presence = presenceByBoard.get(boardId);
  return presence ? Array.from(presence.values()) : [];
}

/**
 * Get user identity for a connection
 */
export function getConnectionIdentity(ws: WebSocket): UserIdentity | undefined {
  return connectionToUser.get(ws);
}

/**
 * Get board ID for a connection
 */
export function getConnectionBoard(ws: WebSocket): string | undefined {
  return connectionToBoard.get(ws);
}

