import type { DrawEvent, ToolType, ShapeType } from '@witeboard/shared';
import { generateUUID, isStrokePayload, isShapePayload, isDeletePayload } from '@witeboard/shared';

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

// Set of deleted stroke IDs (for efficient replay filtering)
export const deletedStrokeIds = new Set<string>();

// Stroke bounding boxes for hit-testing (eraser support)
export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  points: [number, number][];
  color: string;
  width: number;
  opacity: number;
}
export const strokeBoundsMap = new Map<string, StrokeBounds>();

// Current stroke being drawn (optimistic)
export interface PendingStroke {
  strokeId: string;       // Unique ID for this stroke
  color: string;
  width: number;
  opacity: number;        // 1.0 for pencil/brush, 0.7 for marker
  points: [number, number][]; // World coordinates
}
export let pendingStroke: PendingStroke | null = null;

// Pending shape being drawn (for rectangle/ellipse/line tools)
export interface PendingShape {
  strokeId: string;
  shapeType: ShapeType;
  start: [number, number];  // World coordinates
  end: [number, number];    // World coordinates (updated on drag)
  color: string;
  width: number;
  opacity: number;
}
export let pendingShape: PendingShape | null = null;

// Remote cursors (world coordinates)
export interface RemoteCursor {
  x: number;  // World X
  y: number;  // World Y
  displayName: string;
  avatarColor?: string;
  lastUpdate: number;
}
export const cursors = new Map<string, RemoteCursor>();

// ============================================================================
// Tool Presets
// ============================================================================

export interface ToolPreset {
  width: number;
  opacity: number;
}

export const TOOL_PRESETS: Record<'pencil' | 'marker' | 'brush', ToolPreset> = {
  pencil: { width: 2, opacity: 1 },
  marker: { width: 8, opacity: 0.7 },
  brush: { width: 4, opacity: 1 },
};

// Color palette
export const COLOR_PALETTE = [
  '#ffffff', // White
  '#ff6b6b', // Red
  '#ffa94d', // Orange
  '#ffd43b', // Yellow
  '#69db7c', // Green
  '#4dabf7', // Blue
  '#9775fa', // Purple
  '#1a1a1a', // Black
];

// ============================================================================
// Current Tool State
// ============================================================================

export let currentTool: ToolType = 'pencil';
export let currentColor = '#ffffff';
export let currentWidth = TOOL_PRESETS.pencil.width;
export let currentOpacity = TOOL_PRESETS.pencil.opacity;

/**
 * Set the current tool and apply its preset
 */
export function setTool(tool: ToolType): void {
  currentTool = tool;
  
  // Apply preset for brush-type tools
  if (tool === 'pencil' || tool === 'marker' || tool === 'brush') {
    const preset = TOOL_PRESETS[tool];
    currentWidth = preset.width;
    currentOpacity = preset.opacity;
  }
}

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
  deletedStrokeIds.clear();
  strokeBoundsMap.clear();
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
  opacity: number = 1,
  applyTransform: boolean = true
): void {
  if (points.length < 1) return;

  ctx.save();
  
  if (applyTransform) {
    applyViewportTransform(ctx);
  }

  ctx.globalAlpha = opacity;
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
  width: number,
  opacity: number = 1
): void {
  if (!historyCtx) return;
  drawStrokeOnContext(historyCtx, points, color, width, opacity);
}

/**
 * Draw a stroke on the live canvas
 */
export function drawStrokeToLive(
  points: [number, number][],
  color: string,
  width: number,
  opacity: number = 1
): void {
  if (!liveCtx) return;
  drawStrokeOnContext(liveCtx, points, color, width, opacity);
}

/**
 * Draw a line segment on the live canvas (for optimistic drawing)
 */
export function drawSegmentToLive(
  from: [number, number],
  to: [number, number],
  color: string,
  width: number,
  opacity: number = 1
): void {
  if (!liveCtx) return;
  
  liveCtx.save();
  applyViewportTransform(liveCtx);
  
  liveCtx.globalAlpha = opacity;
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
 * Compute bounding box for a set of points
 */
function computeBounds(points: [number, number][], width: number): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const padding = width / 2;
  
  for (const [x, y] of points) {
    minX = Math.min(minX, x - padding);
    minY = Math.min(minY, y - padding);
    maxX = Math.max(maxX, x + padding);
    maxY = Math.max(maxY, y + padding);
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Check if a point is within bounding box
 */
function pointInBounds(x: number, y: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Check if a point is near any segment of a stroke
 */
function pointNearStroke(x: number, y: number, points: [number, number][], threshold: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    
    // Calculate distance from point to line segment
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq === 0) {
      // Segment is a point
      const dist = Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
      if (dist <= threshold) return true;
      continue;
    }
    
    // Project point onto line segment
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    
    const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
    if (dist <= threshold) return true;
  }
  
  // Check if near single point
  if (points.length === 1) {
    const [x1, y1] = points[0];
    return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2) <= threshold;
  }
  
  return false;
}

/**
 * Find stroke at a given world coordinate (for eraser)
 */
export function findStrokeAtPoint(worldX: number, worldY: number): string | null {
  // Search in reverse order (most recent strokes on top)
  const entries = Array.from(strokeBoundsMap.entries()).reverse();
  
  for (const [strokeId, bounds] of entries) {
    // Skip deleted strokes
    if (deletedStrokeIds.has(strokeId)) continue;
    
    // Quick bounding box check
    if (!pointInBounds(worldX, worldY, bounds)) continue;
    
    // Precise stroke check
    const threshold = Math.max(bounds.width, 5); // At least 5px for easy selection
    if (pointNearStroke(worldX, worldY, bounds.points, threshold)) {
      return strokeId;
    }
  }
  
  return null;
}

/**
 * Delete a stroke by ID
 */
export function deleteStroke(strokeId: string): void {
  deletedStrokeIds.add(strokeId);
  redrawAll();
}

/**
 * Draw a shape on a canvas context
 */
function drawShapeOnContext(
  ctx: CanvasRenderingContext2D,
  shapeType: ShapeType,
  start: [number, number],
  end: [number, number],
  color: string,
  width: number,
  opacity: number = 1,
  applyTransform: boolean = true
): void {
  ctx.save();
  
  if (applyTransform) {
    applyViewportTransform(ctx);
  }
  
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  const [x1, y1] = start;
  const [x2, y2] = end;
  
  ctx.beginPath();
  
  switch (shapeType) {
    case 'line':
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      break;
      
    case 'rectangle':
      ctx.rect(x1, y1, x2 - x1, y2 - y1);
      break;
      
    case 'ellipse':
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      const radiusX = Math.abs(x2 - x1) / 2;
      const radiusY = Math.abs(y2 - y1) / 2;
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      break;
  }
  
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a shape on the history canvas
 */
export function drawShapeToHistory(
  shapeType: ShapeType,
  start: [number, number],
  end: [number, number],
  color: string,
  width: number,
  opacity: number = 1
): void {
  if (!historyCtx) return;
  drawShapeOnContext(historyCtx, shapeType, start, end, color, width, opacity);
}

/**
 * Draw a shape on the live canvas (for preview)
 */
export function drawShapeToLive(
  shapeType: ShapeType,
  start: [number, number],
  end: [number, number],
  color: string,
  width: number,
  opacity: number = 1
): void {
  if (!liveCtx) return;
  drawShapeOnContext(liveCtx, shapeType, start, end, color, width, opacity);
}

/**
 * Register a stroke in the bounds map for hit-testing
 */
function registerStrokeBounds(strokeId: string, points: [number, number][], color: string, width: number, opacity: number): void {
  const { minX, minY, maxX, maxY } = computeBounds(points, width);
  strokeBoundsMap.set(strokeId, { minX, minY, maxX, maxY, points, color, width, opacity });
}

/**
 * Register a shape in the bounds map for hit-testing
 */
function registerShapeBounds(strokeId: string, shapeType: ShapeType, start: [number, number], end: [number, number], color: string, width: number, opacity: number): void {
  const [x1, y1] = start;
  const [x2, y2] = end;
  
  // Compute points for the shape outline (for hit-testing)
  let points: [number, number][];
  
  switch (shapeType) {
    case 'line':
      points = [start, end];
      break;
    case 'rectangle':
      points = [
        [x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]
      ];
      break;
    case 'ellipse':
      // Approximate ellipse with points
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      const radiusX = Math.abs(x2 - x1) / 2;
      const radiusY = Math.abs(y2 - y1) / 2;
      points = [];
      for (let i = 0; i <= 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        points.push([
          centerX + Math.cos(angle) * radiusX,
          centerY + Math.sin(angle) * radiusY
        ]);
      }
      break;
  }
  
  const { minX, minY, maxX, maxY } = computeBounds(points, width);
  strokeBoundsMap.set(strokeId, { minX, minY, maxX, maxY, points, color, width, opacity });
}

/**
 * Redraw all content with current viewport
 */
export function redrawAll(): void {
  clearAllCanvases();

  // Replay all strokes/shapes with current viewport, skipping deleted ones
  for (const event of drawLog) {
    if (event.type === 'stroke' && isStrokePayload(event.payload)) {
      // Skip deleted strokes
      if (deletedStrokeIds.has(event.payload.strokeId)) continue;
      
      drawStrokeToHistory(
        event.payload.points,
        event.payload.color,
        event.payload.width,
        event.payload.opacity ?? 1
      );
    } else if (event.type === 'shape' && isShapePayload(event.payload)) {
      // Skip deleted shapes
      if (deletedStrokeIds.has(event.payload.strokeId)) continue;
      
      drawShapeToHistory(
        event.payload.shapeType,
        event.payload.start,
        event.payload.end,
        event.payload.color,
        event.payload.width,
        event.payload.opacity ?? 1
      );
    } else if (event.type === 'clear') {
      clearAllCanvases();
      deletedStrokeIds.clear();
      strokeBoundsMap.clear();
    }
  }
}

/**
 * Replay all events to rebuild the canvas
 */
export function replayAll(events: DrawEvent[]): void {
  drawLog = events;
  deletedStrokeIds.clear();
  strokeBoundsMap.clear();
  
  // First pass: collect all deleted stroke IDs
  for (const event of events) {
    if (event.type === 'delete' && isDeletePayload(event.payload)) {
      for (const id of event.payload.strokeIds) {
        deletedStrokeIds.add(id);
      }
    }
  }
  
  // Build stroke bounds map (for hit-testing)
  for (const event of events) {
    if (event.type === 'stroke' && isStrokePayload(event.payload)) {
      if (!deletedStrokeIds.has(event.payload.strokeId)) {
        registerStrokeBounds(
          event.payload.strokeId,
          event.payload.points,
          event.payload.color,
          event.payload.width,
          event.payload.opacity ?? 1
        );
      }
    } else if (event.type === 'shape' && isShapePayload(event.payload)) {
      if (!deletedStrokeIds.has(event.payload.strokeId)) {
        registerShapeBounds(
          event.payload.strokeId,
          event.payload.shapeType,
          event.payload.start,
          event.payload.end,
          event.payload.color,
          event.payload.width,
          event.payload.opacity ?? 1
        );
      }
    } else if (event.type === 'clear') {
      // Clear resets everything
      deletedStrokeIds.clear();
      strokeBoundsMap.clear();
    }
  }
  
  redrawAll();
}

/**
 * Apply a single draw event (for incoming server events)
 */
export function applyDrawEvent(event: DrawEvent): void {
  drawLog.push(event);

  if (event.type === 'stroke' && isStrokePayload(event.payload)) {
    // Register bounds for hit-testing
    registerStrokeBounds(
      event.payload.strokeId,
      event.payload.points,
      event.payload.color,
      event.payload.width,
      event.payload.opacity ?? 1
    );
    
    // Draw on live canvas
    drawStrokeToLive(
      event.payload.points,
      event.payload.color,
      event.payload.width,
      event.payload.opacity ?? 1
    );
  } else if (event.type === 'shape' && isShapePayload(event.payload)) {
    // Register bounds for hit-testing
    registerShapeBounds(
      event.payload.strokeId,
      event.payload.shapeType,
      event.payload.start,
      event.payload.end,
      event.payload.color,
      event.payload.width,
      event.payload.opacity ?? 1
    );
    
    // Draw on live canvas
    drawShapeToLive(
      event.payload.shapeType,
      event.payload.start,
      event.payload.end,
      event.payload.color,
      event.payload.width,
      event.payload.opacity ?? 1
    );
  } else if (event.type === 'delete' && isDeletePayload(event.payload)) {
    // Add to deleted set and redraw
    for (const id of event.payload.strokeIds) {
      deletedStrokeIds.add(id);
    }
    redrawAll();
  } else if (event.type === 'clear') {
    deletedStrokeIds.clear();
    strokeBoundsMap.clear();
    clearAllCanvases();
  }
}

/**
 * Start a new pending stroke (in world coordinates)
 */
export function startStroke(worldX: number, worldY: number): void {
  pendingStroke = {
    strokeId: generateUUID(),
    color: currentColor,
    width: currentWidth,
    opacity: currentOpacity,
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
  drawSegmentToLive(lastPoint, [worldX, worldY], pendingStroke.color, pendingStroke.width, pendingStroke.opacity);
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
 * Start a new pending shape (in world coordinates)
 */
export function startShape(worldX: number, worldY: number, shapeType: ShapeType): void {
  pendingShape = {
    strokeId: generateUUID(),
    shapeType,
    start: [worldX, worldY],
    end: [worldX, worldY],
    color: currentColor,
    width: currentWidth,
    opacity: currentOpacity,
  };
}

/**
 * Update the pending shape end point (for preview)
 */
export function updateShape(worldX: number, worldY: number): void {
  if (!pendingShape) return;
  
  pendingShape.end = [worldX, worldY];
  
  // Clear live canvas and draw shape preview
  clearLiveCanvas();
  drawShapeToLive(
    pendingShape.shapeType,
    pendingShape.start,
    pendingShape.end,
    pendingShape.color,
    pendingShape.width,
    pendingShape.opacity
  );
}

/**
 * End the pending shape and return it
 */
export function endShape(): PendingShape | null {
  const shape = pendingShape;
  pendingShape = null;
  clearLiveCanvas();
  return shape;
}

/**
 * Get current tool
 */
export function getCurrentTool(): ToolType {
  return currentTool;
}

/**
 * Get current color
 */
export function getCurrentColor(): string {
  return currentColor;
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
