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
  worldToScreen,
  zoomAtPoint,
  pan,
  redrawAll,
  viewport,
  getZoomPercent,
  resetViewport,
  getCurrentTool,
  getCurrentColor,
  getCurrentFontSize,
  currentColor,
  currentWidth,
  currentOpacity,
  pushToUndoStack,
  popFromUndoStack,
  canUndo,
} from '../canvas/state';
import ToolPalette from './ToolPalette';
import styles from './Canvas.module.css';

// Text input state
interface TextInputState {
  visible: boolean;
  worldX: number;
  worldY: number;
  screenX: number;
  screenY: number;
  text: string;
  strokeId: string;
}

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
  // Text input state
  const [textInput, setTextInput] = useState<TextInputState>({
    visible: false,
    worldX: 0,
    worldY: 0,
    screenX: 0,
    screenY: 0,
    text: '',
    strokeId: '',
  });
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const textInputJustOpened = useRef(false);

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

  // Handle undo (Cmd+Z / Ctrl+Z)
  const handleUndo = useCallback(() => {
    const strokeId = popFromUndoStack();
    if (strokeId) {
      wsClient.sendDrawEvent('delete', { strokeIds: [strokeId] });
    }
  }, []);

  // Handle keyboard for space (pan mode) and undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

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
  }, [activeTool, handleUndo]);

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

    // Middle mouse button OR space+left click OR move tool = pan
    if (e.button === 1 || (e.button === 0 && spacePressed.current) || (e.button === 0 && tool === 'move')) {
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

    // Handle text tool
    if (tool === 'text') {
      // If there's already an open text input, submit it first
      if (textInput.visible && textInput.text.trim()) {
        wsClient.sendDrawEvent('text', {
          strokeId: textInput.strokeId,
          text: textInput.text.trim(),
          position: [textInput.worldX, textInput.worldY] as [number, number],
          color: getCurrentColor(),
          fontSize: getCurrentFontSize(),
        });
        // Track for undo
        pushToUndoStack(textInput.strokeId);
      }
      
      // Mark as just opened to prevent immediate blur from closing it
      textInputJustOpened.current = true;
      
      // Show text input at click position
      setTextInput({
        visible: true,
        worldX,
        worldY,
        screenX,
        screenY,
        text: '',
        strokeId: generateUUID(),
      });
      
      // Focus the input after a small delay to ensure it's rendered
      setTimeout(() => {
        textInputRef.current?.focus();
        // Clear the "just opened" flag after focus is established
        setTimeout(() => {
          textInputJustOpened.current = false;
        }, 200);
      }, 10);
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
          // Track for undo
          pushToUndoStack(shape.strokeId);
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
      // Track for undo
      pushToUndoStack(stroke.strokeId);
    }

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Get appropriate cursor for current tool
  const getCursorForTool = (tool: ToolType): string => {
    switch (tool) {
      case 'move':
        return 'grab';
      case 'eraser':
        return 'pointer';
      case 'text':
        return 'text';
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
          // Track for undo
          pushToUndoStack(shape.strokeId);
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
        // Track for undo
        pushToUndoStack(stroke.strokeId);
      }
    }
  };

  const handleResetView = () => {
    resetViewport();
    redrawAll();
    setZoomLevel(100);
  };

  // Submit text and close input
  const submitText = useCallback(() => {
    if (textInput.text.trim()) {
      wsClient.sendDrawEvent('text', {
        strokeId: textInput.strokeId,
        text: textInput.text.trim(),
        position: [textInput.worldX, textInput.worldY] as [number, number],
        color: getCurrentColor(),
        fontSize: getCurrentFontSize(),
      });
      // Track for undo
      pushToUndoStack(textInput.strokeId);
    }
    setTextInput(prev => ({ ...prev, visible: false, text: '' }));
  }, [textInput]);

  // Handle text input key events
  const handleTextKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      // Cancel text input
      setTextInput(prev => ({ ...prev, visible: false, text: '' }));
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Submit on Enter (Shift+Enter for new line)
      e.preventDefault();
      submitText();
    }
  }, [submitText]);

  // Handle text input blur (click outside)
  const handleTextBlur = useCallback(() => {
    // Ignore blur if the input was just opened (prevents immediate closing)
    if (textInputJustOpened.current) {
      return;
    }
    
    // Small delay to allow clicking on canvas for a new text position
    setTimeout(() => {
      // Double-check we're not in the "just opened" state
      if (!textInputJustOpened.current) {
        submitText();
      }
    }, 150);
  }, [submitText]);

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
      <ToolPalette onToolChange={handleToolChange} onUndo={handleUndo} />

      {/* Text input overlay */}
      {textInput.visible && (
        <textarea
          ref={textInputRef}
          className={styles.textInput}
          style={{
            left: textInput.screenX,
            top: textInput.screenY,
            fontSize: `${getCurrentFontSize() * viewport.scale}px`,
            color: getCurrentColor(),
          }}
          value={textInput.text}
          onChange={(e) => setTextInput(prev => ({ ...prev, text: e.target.value }))}
          onKeyDown={handleTextKeyDown}
          onBlur={handleTextBlur}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          placeholder="Type here..."
        />
      )}

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
