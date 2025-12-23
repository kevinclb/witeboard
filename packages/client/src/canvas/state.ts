import type { DrawEvent } from '@witeboard/shared';

/**
 * Canvas Engine State - Imperative module (NOT React state)
 * 
 * Per cursor rules: drawLog and pendingStroke must NOT live in React component state.
 * React re-renders must not drive drawing.
 */

// Authoritative replay log for current board
export let drawLog: DrawEvent[] = [];

// Current stroke being drawn (optimistic)
export interface PendingStroke {
  color: string;
  width: number;
  points: [number, number][];
}
export let pendingStroke: PendingStroke | null = null;

// Remote cursors
export interface RemoteCursor {
  x: number;
  y: number;
  displayName: string;
  avatarColor?: string;
  lastUpdate: number;
}
export const cursors = new Map<string, RemoteCursor>();

// Current drawing settings
export let currentColor = '#ffffff';
export let currentWidth = 3;

// Canvas references (set by Canvas component)
let historyCanvas: HTMLCanvasElement | null = null;
let liveCanvas: HTMLCanvasElement | null = null;
let cursorCanvas: HTMLCanvasElement | null = null;
let historyCtx: CanvasRenderingContext2D | null = null;
let liveCtx: CanvasRenderingContext2D | null = null;
let cursorCtx: CanvasRenderingContext2D | null = null;

/**
 * Initialize canvas references
 */
export function initCanvases(
  history: HTMLCanvasElement,
  live: HTMLCanvasElement,
  cursor: HTMLCanvasElement
): void {
  historyCanvas = history;
  liveCanvas = live;
  cursorCanvas = cursor;
  historyCtx = history.getContext('2d');
  liveCtx = live.getContext('2d');
  cursorCtx = cursor.getContext('2d');

  // Set line rendering style
  if (historyCtx) {
    historyCtx.lineCap = 'round';
    historyCtx.lineJoin = 'round';
  }
  if (liveCtx) {
    liveCtx.lineCap = 'round';
    liveCtx.lineJoin = 'round';
  }
}

/**
 * Get canvas dimensions
 */
export function getCanvasSize(): { width: number; height: number } {
  return {
    width: historyCanvas?.width || 0,
    height: historyCanvas?.height || 0,
  };
}

/**
 * Clear all state (on board change)
 */
export function clearState(): void {
  drawLog = [];
  pendingStroke = null;
  cursors.clear();
  clearAllCanvases();
}

/**
 * Clear all canvases
 */
export function clearAllCanvases(): void {
  const { width, height } = getCanvasSize();
  historyCtx?.clearRect(0, 0, width, height);
  liveCtx?.clearRect(0, 0, width, height);
  cursorCtx?.clearRect(0, 0, width, height);
}

/**
 * Clear the live canvas only
 */
export function clearLiveCanvas(): void {
  const { width, height } = getCanvasSize();
  liveCtx?.clearRect(0, 0, width, height);
}

/**
 * Clear the cursor canvas only
 */
export function clearCursorCanvas(): void {
  const { width, height } = getCanvasSize();
  cursorCtx?.clearRect(0, 0, width, height);
}

/**
 * Draw a stroke on a canvas context
 */
function drawStrokeOnContext(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  width: number
): void {
  if (points.length < 2) {
    // Single point - draw a dot
    if (points.length === 1) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.moveTo(points[0][0], points[0][1]);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }

  ctx.stroke();
}

/**
 * Draw a stroke on the history canvas
 */
export function drawStrokeToHistory(
  points: [number, number][],
  color: string,
  width: number
): void {
  if (!historyCtx) return;
  drawStrokeOnContext(historyCtx, points, color, width);
}

/**
 * Draw a stroke on the live canvas
 */
export function drawStrokeToLive(
  points: [number, number][],
  color: string,
  width: number
): void {
  if (!liveCtx) return;
  drawStrokeOnContext(liveCtx, points, color, width);
}

/**
 * Draw a line segment on the live canvas (for optimistic drawing)
 */
export function drawSegmentToLive(
  from: [number, number],
  to: [number, number],
  color: string,
  width: number
): void {
  if (!liveCtx) return;
  liveCtx.beginPath();
  liveCtx.strokeStyle = color;
  liveCtx.lineWidth = width;
  liveCtx.moveTo(from[0], from[1]);
  liveCtx.lineTo(to[0], to[1]);
  liveCtx.stroke();
}

/**
 * Replay all events to rebuild the canvas
 */
export function replayAll(events: DrawEvent[]): void {
  clearAllCanvases();
  drawLog = events;

  for (const event of events) {
    if (event.type === 'stroke' && event.payload.points) {
      drawStrokeToHistory(
        event.payload.points,
        event.payload.color || '#ffffff',
        event.payload.width || 3
      );
    } else if (event.type === 'clear') {
      clearAllCanvases();
    }
  }
}

/**
 * Apply a single draw event (for incoming server events)
 */
export function applyDrawEvent(event: DrawEvent): void {
  drawLog.push(event);

  if (event.type === 'stroke' && event.payload.points) {
    // Draw on live canvas
    drawStrokeToLive(
      event.payload.points,
      event.payload.color || '#ffffff',
      event.payload.width || 3
    );
  } else if (event.type === 'clear') {
    clearAllCanvases();
  }
}

/**
 * Start a new pending stroke
 */
export function startStroke(x: number, y: number): void {
  pendingStroke = {
    color: currentColor,
    width: currentWidth,
    points: [[x, y]],
  };
}

/**
 * Continue the pending stroke
 */
export function continueStroke(x: number, y: number): void {
  if (!pendingStroke) return;

  const lastPoint = pendingStroke.points[pendingStroke.points.length - 1];
  pendingStroke.points.push([x, y]);

  // Draw segment optimistically
  drawSegmentToLive(lastPoint, [x, y], pendingStroke.color, pendingStroke.width);
}

/**
 * End the pending stroke and return it
 */
export function endStroke(): PendingStroke | null {
  const stroke = pendingStroke;
  pendingStroke = null;
  return stroke;
}

/**
 * Update remote cursor position
 */
export function updateRemoteCursor(
  userId: string,
  x: number,
  y: number,
  displayName: string,
  avatarColor?: string
): void {
  cursors.set(userId, {
    x,
    y,
    displayName,
    avatarColor,
    lastUpdate: Date.now(),
  });
}

/**
 * Remove a remote cursor
 */
export function removeRemoteCursor(userId: string): void {
  cursors.delete(userId);
}

/**
 * Render all remote cursors
 */
export function renderCursors(): void {
  if (!cursorCtx) return;

  clearCursorCanvas();

  const now = Date.now();
  const staleThreshold = 5000; // 5 seconds

  for (const [userId, cursor] of cursors) {
    // Skip stale cursors
    if (now - cursor.lastUpdate > staleThreshold) {
      cursors.delete(userId);
      continue;
    }

    const { x, y, displayName, avatarColor } = cursor;
    const color = avatarColor || '#888888';

    // Draw cursor pointer
    cursorCtx.beginPath();
    cursorCtx.fillStyle = color;
    
    // Triangle cursor shape
    cursorCtx.moveTo(x, y);
    cursorCtx.lineTo(x, y + 16);
    cursorCtx.lineTo(x + 4, y + 12);
    cursorCtx.lineTo(x + 10, y + 18);
    cursorCtx.lineTo(x + 12, y + 16);
    cursorCtx.lineTo(x + 6, y + 10);
    cursorCtx.lineTo(x + 10, y + 6);
    cursorCtx.closePath();
    cursorCtx.fill();

    // Draw name label
    cursorCtx.font = '11px JetBrains Mono, monospace';
    const textWidth = cursorCtx.measureText(displayName).width;
    const padding = 4;
    const labelX = x + 14;
    const labelY = y + 8;

    // Label background
    cursorCtx.fillStyle = color;
    cursorCtx.fillRect(
      labelX - padding,
      labelY - 10,
      textWidth + padding * 2,
      14
    );

    // Label text
    cursorCtx.fillStyle = '#ffffff';
    cursorCtx.fillText(displayName, labelX, labelY);
  }
}

/**
 * Set current drawing color
 */
export function setColor(color: string): void {
  currentColor = color;
}

/**
 * Set current drawing width
 */
export function setWidth(width: number): void {
  currentWidth = width;
}

/**
 * Compact live canvas to history (for performance)
 */
export function compactToHistory(): void {
  if (!historyCtx || !liveCanvas) return;
  
  // Draw live canvas onto history
  historyCtx.drawImage(liveCanvas, 0, 0);
  
  // Clear live canvas
  clearLiveCanvas();
}

