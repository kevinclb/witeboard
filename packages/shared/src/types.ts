// ============================================================================
// Core Data Models (from cursor rules)
// ============================================================================

/**
 * Tool types for drawing
 */
export type ToolType = 'move' | 'pencil' | 'marker' | 'brush' | 'rectangle' | 'ellipse' | 'line' | 'eraser' | 'text';

/**
 * Shape types
 */
export type ShapeType = 'rectangle' | 'ellipse' | 'line';

/**
 * Drawing event payload - the actual stroke/clear/shape/delete/text data
 */
export interface StrokePayload {
  strokeId: string;       // Unique ID for eraser support
  color: string;
  width: number;
  opacity?: number;       // For marker tool (semi-transparent)
  points: [number, number][];
}

export interface ShapePayload {
  strokeId: string;       // Unique ID for eraser support
  shapeType: ShapeType;
  start: [number, number];
  end: [number, number];
  color: string;
  width: number;
  opacity?: number;
}

export interface TextPayload {
  strokeId: string;       // Unique ID for eraser support
  text: string;
  position: [number, number];  // World coordinates
  color: string;
  fontSize: number;
}

export interface DeletePayload {
  strokeIds: string[];    // Which strokes to delete
}

export interface ClearPayload {
  // Empty - clears entire board
}

export type DrawEventPayload = StrokePayload | ShapePayload | TextPayload | DeletePayload | ClearPayload;

/**
 * DrawEvent - Immutable, append-only, server-ordered
 * The server assigns `seq` which is the authoritative ordering per board
 */
export type DrawEventType = 'stroke' | 'clear' | 'delete' | 'shape' | 'text';

export interface DrawEvent {
  boardId: string;
  seq: number;
  type: DrawEventType;
  userId: string;
  timestamp: number;
  payload: DrawEventPayload;
}

/**
 * Type guards for payload types
 */
export function isStrokePayload(payload: DrawEventPayload): payload is StrokePayload {
  return 'strokeId' in payload && 'points' in payload;
}

export function isShapePayload(payload: DrawEventPayload): payload is ShapePayload {
  return 'strokeId' in payload && 'shapeType' in payload;
}

export function isDeletePayload(payload: DrawEventPayload): payload is DeletePayload {
  return 'strokeIds' in payload;
}

export function isTextPayload(payload: DrawEventPayload): payload is TextPayload {
  return 'strokeId' in payload && 'text' in payload;
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
  ownerId?: string;      // Clerk user ID (null for public boards)
  isPrivate: boolean;    // Private boards require owner access
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
    type: DrawEventType;
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

export interface CreateBoardMessage {
  type: 'CREATE_BOARD';
  payload: {
    name?: string;
    isPrivate: boolean;
    clerkToken: string;  // Required - must be signed in to create boards
  };
}

export type ClientMessage =
  | HelloMessage
  | DrawEventMessage
  | CursorMoveMessage
  | LeaveBoardMessage
  | PingMessage
  | CreateBoardMessage;

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

export interface BoardCreatedMessage {
  type: 'BOARD_CREATED';
  payload: {
    boardId: string;
    name?: string;
    isPrivate: boolean;
  };
}

export interface AccessDeniedMessage {
  type: 'ACCESS_DENIED';
  payload: {
    boardId: string;
    reason: string;
  };
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
  | PongMessage
  | BoardCreatedMessage
  | AccessDeniedMessage;

