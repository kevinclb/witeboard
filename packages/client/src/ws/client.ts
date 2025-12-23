import type {
  ClientMessage,
  ServerMessage,
  DrawEvent,
  DrawEventType,
  DrawEventPayload,
  PresenceState,
  UserIdentity,
} from '@witeboard/shared';

type MessageHandler = (message: ServerMessage) => void;

/**
 * WebSocket client singleton
 */
class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private boardId: string | null = null;
  private identity: { clientId: string; displayName: string } | null = null;

  /**
   * Connect to the WebSocket server and join a board
   */
  connect(
    boardId: string,
    identity: { clientId: string; displayName: string }
  ): void {
    this.boardId = boardId;
    this.identity = identity;

    if (this.ws?.readyState === WebSocket.OPEN) {
      // Already connected, just send HELLO
      this.sendHello();
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return; // Already connecting
    }

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // In development, connect directly to backend port
    // In production, connect to same origin (server handles both HTTP and WS)
    const wsUrl = import.meta.env.DEV
      ? `ws://localhost:3001`
      : `${protocol}//${host}`;

    console.log(`Connecting to ${wsUrl}...`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.sendHello();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        this.handlers.forEach((handler) => handler(message));
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.boardId = null;
  }

  /**
   * Subscribe to server messages
   */
  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Send a message to the server
   */
  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send HELLO message
   */
  private sendHello(): void {
    if (!this.boardId || !this.identity) return;

    this.send({
      type: 'HELLO',
      payload: {
        boardId: this.boardId,
        clientId: this.identity.clientId,
        displayName: this.identity.displayName,
        isAnonymous: true,
      },
    });
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.boardId && this.identity) {
        console.log('Attempting to reconnect...');
        this.connect(this.boardId, this.identity);
      }
    }, 2000);
  }

  /**
   * Send a draw event
   */
  sendDrawEvent(type: DrawEventType, payload: DrawEventPayload): void {
    this.send({
      type: 'DRAW_EVENT',
      payload: { type, payload },
    });
  }

  /**
   * Send cursor position
   */
  sendCursorMove(x: number, y: number): void {
    this.send({
      type: 'CURSOR_MOVE',
      payload: { x, y },
    });
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();

// Types for callbacks
export type OnDrawEvent = (event: DrawEvent) => void;
export type OnSyncSnapshot = (events: DrawEvent[]) => void;
export type OnUserList = (users: PresenceState[]) => void;
export type OnUserJoin = (user: PresenceState) => void;
export type OnUserLeave = (userId: string) => void;
export type OnWelcome = (identity: UserIdentity) => void;
export type OnCursorMove = (data: {
  userId: string;
  displayName: string;
  avatarColor?: string;
  x: number;
  y: number;
}) => void;

