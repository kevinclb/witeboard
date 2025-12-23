import type { DrawEvent } from '@witeboard/shared';

/**
 * Canvas Engine State - Imperative module (NOT React state)
 * 
 * Per cursor rules: drawLog and pendingStroke must NOT live in React component state.
 * React re-renders must not drive drawing.
 */

// ============================================================================
// Viewport (Pan/Zoom) - Local per client, NOT synced
// ============================================================================

export interface Viewport {
  offsetX: number;  // Pan offset in screen pixels
  offsetY: number;
  scale: number;    // Zoom level (1 = 100%)
}

export const viewport: Viewport = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

// Zoom constraints
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(screenX: number, screenY: number): [number, number] {
  return [
    (screenX - viewport.offsetX) / viewport.scale,
    (screenY - viewport.offsetY) / viewport.scale,
  ];
}

/**
 * Convert world coordinates to screen coordinates
 */
export function worldToScreen(worldX: number, worldY: number): [number, number] {
  return [
    worldX * viewport.scale + viewport.offsetX,
    worldY * viewport.scale + viewport.offsetY,
  ];
}

/**
 * Zoom toward a screen point (keeps that point stationary)
 */
export function zoomAtPoint(screenX: number, screenY: number, delta: number): void {
  const zoomFactor = delta > 0 ? 0.9 : 1.1;
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * zoomFactor));
  
  if (newScale === viewport.scale) return;

  // Get world point under cursor before zoom
  const [worldX, worldY] = screenToWorld(screenX, screenY);
  
  // Apply new scale
  viewport.scale = newScale;
  
  // Adjust offset so world point stays under cursor
  viewport.offsetX = screenX - worldX * viewport.scale;
  viewport.offsetY = screenY - worldY * viewport.scale;
}

/**
 * Pan the viewport by screen pixels
 */
export function pan(deltaX: number, deltaY: number): void {
  viewport.offsetX += deltaX;
  viewport.offsetY += deltaY;
}

/**
 * Reset viewport to default
 */
export function resetViewport(): void {
  viewport.offsetX = 0;
  viewport.offsetY = 0;
  viewport.scale = 1;
}

/**
 * Get current zoom percentage for display
 */
export function getZoomPercent(): number {
  return Math.round(viewport.scale * 100);
}

// ============================================================================
// Drawing State
// ============================================================================

// Authoritative replay log for current board
export let drawLog: DrawEvent[] = [];

// Current stroke being drawn (optimistic)
export interface PendingStroke {
  color: string;
  width: number;
  points: [number, number][]; // World coordinates
}
export let pendingStroke: PendingStroke | null = null;

// Remote cursors (world coordinates)
export interface RemoteCursor {
  x: number;  // World X
  y: number;  // World Y
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

// Device pixel ratio for sharp rendering
let dpr = 1;

/**
 * Initialize canvas references
 */
export function initCanvases(
  history: HTMLCanvasElement,
  live: HTMLCanvasElement,
  cursor: HTMLCanvasElement,
  devicePixelRatio: number = 1
): void {
  historyCanvas = history;
  liveCanvas = live;
  cursorCanvas = cursor;
  historyCtx = history.getContext('2d');
  liveCtx = live.getContext('2d');
  cursorCtx = cursor.getContext('2d');
  dpr = devicePixelRatio;

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
 * Get canvas dimensions (in CSS pixels, not device pixels)
 */
export function getCanvasSize(): { width: number; height: number } {
  return {
    width: (historyCanvas?.width || 0) / dpr,
    height: (historyCanvas?.height || 0) / dpr,
  };
}

/**
 * Clear all state (on board change)
 */
export function clearState(): void {
  drawLog = [];
  pendingStroke = null;
  cursors.clear();
  resetViewport();
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
 * Apply viewport transform to a context
 */
function applyViewportTransform(ctx: CanvasRenderingContext2D): void {
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);
}

/**
 * Draw a stroke on a canvas context (in world coordinates)
 */
function drawStrokeOnContext(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  width: number,
  applyTransform: boolean = true
): void {
  if (points.length < 1) return;

  ctx.save();
  
  if (applyTransform) {
    applyViewportTransform(ctx);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (points.length === 1) {
    // Single point - draw a dot
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.moveTo(points[0][0], points[0][1]);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }

    ctx.stroke();
  }

  ctx.restore();
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
  
  liveCtx.save();
  applyViewportTransform(liveCtx);
  
  liveCtx.lineCap = 'round';
  liveCtx.lineJoin = 'round';
  liveCtx.beginPath();
  liveCtx.strokeStyle = color;
  liveCtx.lineWidth = width;
  liveCtx.moveTo(from[0], from[1]);
  liveCtx.lineTo(to[0], to[1]);
  liveCtx.stroke();
  
  liveCtx.restore();
}

/**
 * Redraw all content with current viewport
 */
export function redrawAll(): void {
  clearAllCanvases();

  // Replay all strokes with current viewport
  for (const event of drawLog) {
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
 * Replay all events to rebuild the canvas
 */
export function replayAll(events: DrawEvent[]): void {
  drawLog = events;
  redrawAll();
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
 * Start a new pending stroke (in world coordinates)
 */
export function startStroke(worldX: number, worldY: number): void {
  pendingStroke = {
    color: currentColor,
    width: currentWidth,
    points: [[worldX, worldY]],
  };
}

/**
 * Continue the pending stroke (in world coordinates)
 */
export function continueStroke(worldX: number, worldY: number): void {
  if (!pendingStroke) return;

  const lastPoint = pendingStroke.points[pendingStroke.points.length - 1];
  pendingStroke.points.push([worldX, worldY]);

  // Draw segment optimistically
  drawSegmentToLive(lastPoint, [worldX, worldY], pendingStroke.color, pendingStroke.width);
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
 * Update remote cursor position (in world coordinates)
 */
export function updateRemoteCursor(
  userId: string,
  worldX: number,
  worldY: number,
  displayName: string,
  avatarColor?: string
): void {
  cursors.set(userId, {
    x: worldX,
    y: worldY,
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
 * Render all remote cursors (converts world to screen)
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

    // Convert world to screen coordinates
    const [screenX, screenY] = worldToScreen(cursor.x, cursor.y);
    const { displayName, avatarColor } = cursor;
    const color = avatarColor || '#888888';

    // Draw cursor pointer (fixed size on screen)
    cursorCtx.beginPath();
    cursorCtx.fillStyle = color;
    
    // Triangle cursor shape
    cursorCtx.moveTo(screenX, screenY);
    cursorCtx.lineTo(screenX, screenY + 16);
    cursorCtx.lineTo(screenX + 4, screenY + 12);
    cursorCtx.lineTo(screenX + 10, screenY + 18);
    cursorCtx.lineTo(screenX + 12, screenY + 16);
    cursorCtx.lineTo(screenX + 6, screenY + 10);
    cursorCtx.lineTo(screenX + 10, screenY + 6);
    cursorCtx.closePath();
    cursorCtx.fill();

    // Draw name label
    cursorCtx.font = '11px JetBrains Mono, monospace';
    const textWidth = cursorCtx.measureText(displayName).width;
    const padding = 4;
    const labelX = screenX + 14;
    const labelY = screenY + 8;

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
 * Note: With viewport, we need to redraw rather than copy pixels
 */
export function compactToHistory(): void {
  if (!historyCtx || !liveCanvas) return;
  
  // Redraw everything to history
  redrawAll();
}
