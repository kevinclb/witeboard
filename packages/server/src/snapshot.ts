import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas';
import type { DrawEvent } from '@witeboard/shared';
import { isStrokePayload, isShapePayload, isTextPayload, isDeletePayload } from '@witeboard/shared';

/**
 * Snapshot Renderer - Server-side canvas rendering for compaction
 * 
 * Uses node-canvas to render drawing events into a PNG image.
 * This allows new clients to load a snapshot image instead of
 * replaying thousands of individual draw events.
 */

// Default canvas size for snapshots (will be scaled to fit content)
const CANVAS_WIDTH = 4096;
const CANVAS_HEIGHT = 4096;

// Background color (must match client's --canvas-bg CSS variable)
const BACKGROUND_COLOR = '#1e1e1e';

/**
 * Render a list of draw events to a base64-encoded PNG
 */
export function renderEventsToSnapshot(events: DrawEvent[]): string {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Set up line rendering
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Track deleted stroke IDs
  const deletedIds = new Set<string>();

  // First pass: collect all deleted stroke IDs
  for (const event of events) {
    if (event.type === 'delete' && isDeletePayload(event.payload)) {
      for (const id of event.payload.strokeIds) {
        deletedIds.add(id);
      }
    }
  }

  // Second pass: render all non-deleted strokes/shapes/text
  for (const event of events) {
    if (event.type === 'stroke' && isStrokePayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      renderStroke(ctx, event.payload);
    } else if (event.type === 'shape' && isShapePayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      renderShape(ctx, event.payload);
    } else if (event.type === 'text' && isTextPayload(event.payload)) {
      if (deletedIds.has(event.payload.strokeId)) continue;
      renderText(ctx, event.payload);
    } else if (event.type === 'clear') {
      // Clear resets the canvas
      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      deletedIds.clear();
    }
  }

  // Convert to base64 PNG
  return canvas.toDataURL('image/png');
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

