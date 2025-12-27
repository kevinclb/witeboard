import { createCanvas, type CanvasRenderingContext2D } from 'canvas';
import type { DrawEvent } from '@witeboard/shared';
import { isStrokePayload, isShapePayload, isTextPayload, isDeletePayload } from '@witeboard/shared';

/**
 * Snapshot Renderer - Server-side canvas rendering for compaction
 * 
 * Uses node-canvas to render drawing events into a PNG image.
 * This allows new clients to load a snapshot image instead of
 * replaying thousands of individual draw events.
 * 
 * The renderer calculates bounding box of all content and creates
 * a canvas sized to fit, with padding. Content is translated so
 * coordinates map correctly when rendered on the client.
 */

// Maximum canvas size (to prevent memory issues)
const MAX_CANVAS_SIZE = 16384;
const PADDING = 100;

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculate bounding box of all events
 */
function calculateBounds(events: DrawEvent[], deletedIds: Set<string>): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasContent = false;

  for (const event of events) {
    if (event.type === 'stroke' && isStrokePayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      const { points, width } = event.payload;
      for (const [x, y] of points) {
        minX = Math.min(minX, x - width);
        minY = Math.min(minY, y - width);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + width);
        hasContent = true;
      }
    } else if (event.type === 'shape' && isShapePayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      const { start, end, width } = event.payload;
      minX = Math.min(minX, start[0] - width, end[0] - width);
      minY = Math.min(minY, start[1] - width, end[1] - width);
      maxX = Math.max(maxX, start[0] + width, end[0] + width);
      maxY = Math.max(maxY, start[1] + width, end[1] + width);
      hasContent = true;
    } else if (event.type === 'text' && isTextPayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      const { position, fontSize, text } = event.payload;
      const lines = text.split('\n');
      const textWidth = Math.max(...lines.map(l => l.length)) * fontSize * 0.6;
      const textHeight = lines.length * fontSize * 1.3;
      minX = Math.min(minX, position[0]);
      minY = Math.min(minY, position[1]);
      maxX = Math.max(maxX, position[0] + textWidth);
      maxY = Math.max(maxY, position[1] + textHeight);
      hasContent = true;
    }
  }

  return hasContent ? { minX, minY, maxX, maxY } : null;
}

export interface SnapshotResult {
  imageData: string;
  offsetX: number;
  offsetY: number;
}

/**
 * Render a list of draw events to a base64-encoded PNG
 * Note: Uses transparent background so client CSS background shows through
 * Returns the image data and the world-space offset of the snapshot origin
 */
export function renderEventsToSnapshot(events: DrawEvent[]): SnapshotResult {
  // Track deleted stroke IDs
  const deletedIds = new Set<string>();
  
  // First pass: collect all deleted stroke IDs and handle clears
  let lastClearIndex = -1;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === 'delete' && isDeletePayload(event.payload)) {
      for (const id of event.payload.strokeIds) {
        deletedIds.add(id);
      }
    } else if (event.type === 'clear') {
      lastClearIndex = i;
      deletedIds.clear(); // Clear resets everything
    }
  }

  // Only render events after the last clear
  const eventsToRender = lastClearIndex >= 0 ? events.slice(lastClearIndex + 1) : events;

  // Calculate bounding box
  const bounds = calculateBounds(eventsToRender, deletedIds);
  
  if (!bounds) {
    // No content - return minimal transparent canvas at origin
    const canvas = createCanvas(1, 1);
    return {
      imageData: canvas.toDataURL('image/png'),
      offsetX: 0,
      offsetY: 0,
    };
  }

  // Calculate canvas size with padding
  const width = Math.min(MAX_CANVAS_SIZE, Math.ceil(bounds.maxX - bounds.minX + PADDING * 2));
  const height = Math.min(MAX_CANVAS_SIZE, Math.ceil(bounds.maxY - bounds.minY + PADDING * 2));

  // Offset to translate content to positive coordinates
  const offsetX = -bounds.minX + PADDING;
  const offsetY = -bounds.minY + PADDING;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Canvas starts transparent by default
  // Apply translation to handle arbitrary world coordinates
  ctx.translate(offsetX, offsetY);

  // Set up line rendering
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Second pass: render all non-deleted strokes/shapes/text
  for (const event of eventsToRender) {
    if (event.type === 'stroke' && isStrokePayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      renderStroke(ctx, event.payload);
    } else if (event.type === 'shape' && isShapePayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      renderShape(ctx, event.payload);
    } else if (event.type === 'text' && isTextPayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      renderText(ctx, event.payload);
    }
  }

  // Convert to base64 PNG and return with offset info
  // The offset tells the client where in world-space to draw this image
  return {
    imageData: canvas.toDataURL('image/png'),
    offsetX: bounds.minX - PADDING,
    offsetY: bounds.minY - PADDING,
  };
}

/**
 * Render a stroke to the canvas
 */
function renderStroke(
  ctx: CanvasRenderingContext2D,
  payload: { points: [number, number][]; color: string; width: number; opacity?: number }
): void {
  const { points, color, width, opacity = 1 } = payload;
  if (points.length < 1) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;

  if (points.length === 1) {
    // Single point - draw a dot
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Render a shape to the canvas
 */
function renderShape(
  ctx: CanvasRenderingContext2D,
  payload: {
    shapeType: 'rectangle' | 'ellipse' | 'line';
    start: [number, number];
    end: [number, number];
    color: string;
    width: number;
    opacity?: number;
  }
): void {
  const { shapeType, start, end, color, width, opacity = 1 } = payload;
  const [x1, y1] = start;
  const [x2, y2] = end;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;

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
 * Render text to the canvas
 */
function renderText(
  ctx: CanvasRenderingContext2D,
  payload: { text: string; position: [number, number]; color: string; fontSize: number }
): void {
  const { text, position, color, fontSize } = payload;
  const [x, y] = position;

  ctx.save();
  ctx.font = `${fontSize}px "JetBrains Mono", "SF Mono", monospace`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';

  // Handle multiline text
  const lines = text.split('\n');
  const lineHeight = fontSize * 1.3;

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });

  ctx.restore();
}

/**
 * Calculate the approximate size of a snapshot in bytes
 */
export function estimateSnapshotSize(events: DrawEvent[]): number {
  // Rough estimate: each stroke averages ~100 bytes when compressed
  // PNG compression is typically 50-70% of raw data
  return events.length * 50;
}
