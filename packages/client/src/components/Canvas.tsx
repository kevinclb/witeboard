import { useEffect, useRef, useCallback, useState } from 'react';
import { wsClient } from '../ws/client';
import { usePresenceStore } from '../stores/presence';
import { throttle, generateUUID } from '@witeboard/shared';
import type { ServerMessage, ToolType, ShapeType } from '@witeboard/shared';
import {
  initCanvases,
  clearState,
  replayAll,
  applyDrawEvent,
  startStroke,
  continueStroke,
  endStroke,
  startShape,
  updateShape,
  endShape,
  findStrokeAtPoint,
  updateRemoteCursor,
  removeRemoteCursor,
  renderCursors,
  compactToHistory,
  drawLog,
  screenToWorld,
  zoomAtPoint,
  pan,
  redrawAll,
  viewport,
  getZoomPercent,
  resetViewport,
  getCurrentTool,
  currentColor,
  currentWidth,
  currentOpacity,
} from '../canvas/state';
import ToolPalette from './ToolPalette';
import styles from './Canvas.module.css';

interface CanvasProps {
  boardId: string;
}

// Compaction threshold (compact after N strokes on live canvas)
const COMPACT_THRESHOLD = 50;
let strokesSinceCompact = 0;

export default function Canvas({ boardId }: CanvasProps) {
  const historyRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const isShaping = useRef(false);  // For shape tools
  const isPanning = useRef(false);
  const lastPanPos = useRef<{ x: number; y: number } | null>(null);
  const spacePressed = useRef(false);
  const animationFrameRef = useRef<number>(0);

  // Track zoom for display (triggers re-render for zoom indicator)
  const [zoomLevel, setZoomLevel] = useState(100);
  // Track current tool for cursor updates
  const [activeTool, setActiveTool] = useState<ToolType>('pencil');

  const currentUserId = usePresenceStore((state) => state.currentUser?.userId);

  // Resize canvases to fill container
  const resizeCanvases = useCallback(() => {
    const container = containerRef.current;
    const history = historyRef.current;
    const live = liveRef.current;
    const cursor = cursorRef.current;

    if (!container || !history || !live || !cursor) return;

    const { width, height } = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size
    [history, live, cursor].forEach((canvas) => {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    });

    // Re-initialize contexts
    initCanvases(history, live, cursor, dpr);

    // Redraw with current viewport
    redrawAll();
  }, []);

  // Handle window resize
  useEffect(() => {
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  // Handle keyboard for space (pan mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        spacePressed.current = true;
        if (containerRef.current) {
          containerRef.current.style.cursor = 'grab';
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressed.current = false;
        isPanning.current = false;
        lastPanPos.current = null;
        if (containerRef.current) {
          containerRef.current.style.cursor = getCursorForTool(activeTool);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool]);

  // Initialize canvases and subscribe to messages
  useEffect(() => {
    const history = historyRef.current;
    const live = liveRef.current;
    const cursor = cursorRef.current;

    if (!history || !live || !cursor) return;

    // Initialize
    const dpr = window.devicePixelRatio || 1;
    initCanvases(history, live, cursor, dpr);
    resizeCanvases();

    // Subscribe to server messages
    const unsubscribe = wsClient.subscribe((message: ServerMessage) => {
      switch (message.type) {
        case 'SYNC_SNAPSHOT':
          clearState();
          replayAll(message.payload.events);
          strokesSinceCompact = 0;
          setZoomLevel(100);
          break;

        case 'DRAW_EVENT':
          applyDrawEvent(message.payload);
          strokesSinceCompact++;

          // Compact if needed
          if (strokesSinceCompact >= COMPACT_THRESHOLD) {
            compactToHistory();
            strokesSinceCompact = 0;
          }
          break;

        case 'CURSOR_MOVE':
          if (message.payload.userId !== currentUserId) {
            updateRemoteCursor(
              message.payload.userId,
              message.payload.x,
              message.payload.y,
              message.payload.displayName,
              message.payload.avatarColor
            );
          }
          break;

        case 'USER_LEAVE':
          removeRemoteCursor(message.payload.userId);
          break;
      }
    });

    // Start cursor rendering loop
    const renderLoop = () => {
      renderCursors();
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };
    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      unsubscribe();
      cancelAnimationFrame(animationFrameRef.current);
      clearState();
    };
  }, [boardId, currentUserId, resizeCanvases]);

  // Throttled cursor move (sends world coordinates)
  const throttledCursorMove = useCallback(
    throttle((worldX: number, worldY: number) => {
      wsClient.sendCursorMove(worldX, worldY);
    }, 50),
    []
  );

  // Get pointer position relative to canvas (screen coordinates)
  const getScreenPos = (e: React.PointerEvent | React.WheelEvent): { x: number; y: number } => {
    const canvas = cursorRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Handle wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const { x, y } = getScreenPos(e);
    zoomAtPoint(x, y, e.deltaY);
    redrawAll();
    setZoomLevel(getZoomPercent());
  }, []);

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const { x: screenX, y: screenY } = getScreenPos(e);
    const [worldX, worldY] = screenToWorld(screenX, screenY);
    const tool = getCurrentTool();

    // Middle mouse button OR space+left click = pan
    if (e.button === 1 || (e.button === 0 && spacePressed.current)) {
      isPanning.current = true;
      lastPanPos.current = { x: screenX, y: screenY };
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Left click only
    if (e.button !== 0) return;

    // Handle eraser tool
    if (tool === 'eraser') {
      const strokeId = findStrokeAtPoint(worldX, worldY);
      if (strokeId) {
        // Send delete event to server
        wsClient.sendDrawEvent('delete', { strokeIds: [strokeId] });
      }
      return;
    }

    // Handle shape tools
    if (tool === 'rectangle' || tool === 'ellipse' || tool === 'line') {
      isShaping.current = true;
      startShape(worldX, worldY, tool as ShapeType);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Handle brush tools (pencil, marker, brush)
    isDrawing.current = true;
    startStroke(worldX, worldY);

    // Capture pointer for smooth drawing outside canvas
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const { x: screenX, y: screenY } = getScreenPos(e);
    const [worldX, worldY] = screenToWorld(screenX, screenY);

    // Handle panning
    if (isPanning.current && lastPanPos.current) {
      const dx = screenX - lastPanPos.current.x;
      const dy = screenY - lastPanPos.current.y;
      pan(dx, dy);
      lastPanPos.current = { x: screenX, y: screenY };
      redrawAll();
      return;
    }

    // Always send cursor position (world coordinates)
    throttledCursorMove(worldX, worldY);

    // Update shape preview if shaping
    if (isShaping.current) {
      updateShape(worldX, worldY);
      return;
    }

    // Continue stroke if drawing
    if (isDrawing.current) {
      continueStroke(worldX, worldY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // End pan
    if (isPanning.current) {
      isPanning.current = false;
      lastPanPos.current = null;
      if (containerRef.current) {
        containerRef.current.style.cursor = spacePressed.current ? 'grab' : getCursorForTool(activeTool);
      }
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      return;
    }

    // End shape
    if (isShaping.current) {
      isShaping.current = false;
      const shape = endShape();

      if (shape) {
        // Check if shape has actual size (not just a click)
        const [x1, y1] = shape.start;
        const [x2, y2] = shape.end;
        const hasSize = Math.abs(x2 - x1) > 2 || Math.abs(y2 - y1) > 2;
        
        if (hasSize) {
          // Send to server
          wsClient.sendDrawEvent('shape', {
            strokeId: shape.strokeId,
            shapeType: shape.shapeType,
            start: shape.start,
            end: shape.end,
            color: shape.color,
            width: shape.width,
            opacity: shape.opacity,
          });
        }
      }

      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      return;
    }

    if (!isDrawing.current) return;

    isDrawing.current = false;
    const stroke = endStroke();

    if (stroke && stroke.points.length > 0) {
      // Send to server (world coordinates) with unique strokeId
      wsClient.sendDrawEvent('stroke', {
        strokeId: stroke.strokeId,
        color: stroke.color,
        width: stroke.width,
        opacity: stroke.opacity,
        points: stroke.points,
      });
    }

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Get appropriate cursor for current tool
  const getCursorForTool = (tool: ToolType): string => {
    switch (tool) {
      case 'eraser':
        return 'pointer';
      case 'rectangle':
      case 'ellipse':
      case 'line':
        return 'crosshair';
      default:
        return 'crosshair';
    }
  };

  // Handle tool change
  const handleToolChange = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    if (containerRef.current && !spacePressed.current) {
      containerRef.current.style.cursor = getCursorForTool(tool);
    }
  }, []);

  const handlePointerLeave = () => {
    // End pan
    if (isPanning.current) {
      isPanning.current = false;
      lastPanPos.current = null;
      if (containerRef.current) {
        containerRef.current.style.cursor = getCursorForTool(activeTool);
      }
    }

    // End shape if we leave the canvas
    if (isShaping.current) {
      isShaping.current = false;
      const shape = endShape();

      if (shape) {
        const [x1, y1] = shape.start;
        const [x2, y2] = shape.end;
        const hasSize = Math.abs(x2 - x1) > 2 || Math.abs(y2 - y1) > 2;
        
        if (hasSize) {
          wsClient.sendDrawEvent('shape', {
            strokeId: shape.strokeId,
            shapeType: shape.shapeType,
            start: shape.start,
            end: shape.end,
            color: shape.color,
            width: shape.width,
            opacity: shape.opacity,
          });
        }
      }
    }

    // End stroke if we leave the canvas
    if (isDrawing.current) {
      isDrawing.current = false;
      const stroke = endStroke();

      if (stroke && stroke.points.length > 0) {
        wsClient.sendDrawEvent('stroke', {
          strokeId: stroke.strokeId,
          color: stroke.color,
          width: stroke.width,
          opacity: stroke.opacity,
          points: stroke.points,
        });
      }
    }
  };

  const handleResetView = () => {
    resetViewport();
    redrawAll();
    setZoomLevel(100);
  };

  return (
    <div ref={containerRef} className={styles.container}>
      {/* History canvas - bottom layer */}
      <canvas ref={historyRef} className={styles.canvas} />

      {/* Live canvas - middle layer */}
      <canvas ref={liveRef} className={styles.canvas} />

      {/* Cursor canvas - top layer (receives pointer events) */}
      <canvas
        ref={cursorRef}
        className={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      />

      {/* Tool palette */}
      <ToolPalette onToolChange={handleToolChange} />

      {/* Zoom indicator */}
      <div className={styles.zoomIndicator}>
        <button
          className={styles.zoomButton}
          onClick={() => {
            const center = getScreenPos({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 } as React.WheelEvent);
            zoomAtPoint(center.x, center.y, 100); // zoom out
            redrawAll();
            setZoomLevel(getZoomPercent());
          }}
          title="Zoom out"
        >
          −
        </button>
        <button
          className={styles.zoomLevel}
          onClick={handleResetView}
          title="Reset view"
        >
          {zoomLevel}%
        </button>
        <button
          className={styles.zoomButton}
          onClick={() => {
            const center = getScreenPos({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 } as React.WheelEvent);
            zoomAtPoint(center.x, center.y, -100); // zoom in
            redrawAll();
            setZoomLevel(getZoomPercent());
          }}
          title="Zoom in"
        >
          +
        </button>
      </div>

      {/* Pan hint */}
      <div className={styles.panHint}>
        <span>Scroll to zoom • Space+drag or middle-click to pan</span>
      </div>
    </div>
  );
}
