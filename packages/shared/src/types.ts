// ============================================================================
// Core Data Models (from cursor rules)
// ============================================================================

/**
 * Drawing event payload - the actual stroke/clear data
 */
export interface DrawEventPayload {
  color?: string;
  width?: number;
  points?: [number, number][];
}

/**
 * DrawEvent - Immutable, append-only, server-ordered
 * The server assigns `seq` which is the authoritative ordering per board
 */
export interface DrawEvent {
  boardId: string;
  seq: number;
  type: 'stroke' | 'clear';
  userId: string;
  timestamp: number;
  payload: DrawEventPayload;
}

/**
 * User identity - can be anonymous or authenticated
 */
export interface UserIdentity {
  userId: string;
  displayName: string;
  isAnonymous: boolean;
  avatarColor?: string;
}

/**
 * Presence state - ephemeral, per-board user state
 */
export interface PresenceState {
  boardId: string;
  userId: string;
  displayName: string;
  isAnonymous: boolean;
  avatarColor?: string;
  cursor?: { x: number; y: number; t: number };
  connectedAt: number;
}

/**
 * Board metadata
 */
export interface Board {
  id: string;
  createdAt: number;
  name?: string;
}

// ============================================================================
// WebSocket Protocol Messages
// ============================================================================

// --- Client -> Server Messages ---

export interface HelloMessage {
  type: 'HELLO';
  payload: {
    boardId: string;
    authToken?: string;
    clientId?: string;
    displayName?: string;
    isAnonymous: boolean;
  };
}

export interface DrawEventMessage {
  type: 'DRAW_EVENT';
  payload: {
    type: 'stroke' | 'clear';
    payload: DrawEventPayload;
  };
}

export interface CursorMoveMessage {
  type: 'CURSOR_MOVE';
  payload: {
    x: number;
    y: number;
  };
}

export interface LeaveBoardMessage {
  type: 'LEAVE_BOARD';
}

export interface PingMessage {
  type: 'PING';
}

export type ClientMessage =
  | HelloMessage
  | DrawEventMessage
  | CursorMoveMessage
  | LeaveBoardMessage
  | PingMessage;

// --- Server -> Client Messages ---

export interface SyncSnapshotMessage {
  type: 'SYNC_SNAPSHOT';
  payload: {
    boardId: string;
    events: DrawEvent[];
  };
}

export interface ServerDrawEventMessage {
  type: 'DRAW_EVENT';
  payload: DrawEvent;
}

export interface ServerCursorMoveMessage {
  type: 'CURSOR_MOVE';
  payload: {
    boardId: string;
    userId: string;
    displayName: string;
    avatarColor?: string;
    x: number;
    y: number;
  };
}

export interface UserListMessage {
  type: 'USER_LIST';
  payload: {
    boardId: string;
    users: PresenceState[];
  };
}

export interface UserJoinMessage {
  type: 'USER_JOIN';
  payload: {
    boardId: string;
    user: PresenceState;
  };
}

export interface UserLeaveMessage {
  type: 'USER_LEAVE';
  payload: {
    boardId: string;
    userId: string;
  };
}

export interface WelcomeMessage {
  type: 'WELCOME';
  payload: {
    userId: string;
    displayName: string;
    avatarColor: string;
  };
}

export interface ErrorMessage {
  type: 'ERROR';
  payload: {
    code: string;
    message: string;
  };
}

export interface PongMessage {
  type: 'PONG';
}

export type ServerMessage =
  | SyncSnapshotMessage
  | ServerDrawEventMessage
  | ServerCursorMoveMessage
  | UserListMessage
  | UserJoinMessage
  | UserLeaveMessage
  | WelcomeMessage
  | ErrorMessage
  | PongMessage;

