import { useEffect, useRef, useCallback } from 'react';
import { wsClient } from '../ws/client';
import { usePresenceStore } from '../stores/presence';
import { throttle } from '@witeboard/shared';
import {
  initCanvases,
  clearState,
  replayAll,
  applyDrawEvent,
  startStroke,
  continueStroke,
  endStroke,
  updateRemoteCursor,
  removeRemoteCursor,
  renderCursors,
  compactToHistory,
  drawLog,
} from '../canvas/state';
import type { ServerMessage } from '@witeboard/shared';
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
  const animationFrameRef = useRef<number>(0);

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
    initCanvases(history, live, cursor);

    // Replay all events to restore state
    replayAll(drawLog);
  }, []);

  // Handle window resize
  useEffect(() => {
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  // Initialize canvases and subscribe to messages
  useEffect(() => {
    const history = historyRef.current;
    const live = liveRef.current;
    const cursor = cursorRef.current;

    if (!history || !live || !cursor) return;

    // Initialize
    initCanvases(history, live, cursor);
    resizeCanvases();

    // Subscribe to server messages
    const unsubscribe = wsClient.subscribe((message: ServerMessage) => {
      switch (message.type) {
        case 'SYNC_SNAPSHOT':
          clearState();
          replayAll(message.payload.events);
          strokesSinceCompact = 0;
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

  // Throttled cursor move
  const throttledCursorMove = useCallback(
    throttle((x: number, y: number) => {
      wsClient.sendCursorMove(x, y);
    }, 50),
    []
  );

  // Get pointer position relative to canvas
  const getPointerPos = (e: React.PointerEvent): [number, number] => {
    const canvas = liveRef.current;
    if (!canvas) return [0, 0];

    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click

    isDrawing.current = true;
    const [x, y] = getPointerPos(e);
    startStroke(x, y);

    // Capture pointer for smooth drawing outside canvas
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const [x, y] = getPointerPos(e);

    // Always send cursor position
    throttledCursorMove(x, y);

    // Continue stroke if drawing
    if (isDrawing.current) {
      continueStroke(x, y);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;

    isDrawing.current = false;
    const stroke = endStroke();

    if (stroke && stroke.points.length > 0) {
      // Send to server
      wsClient.sendDrawEvent('stroke', {
        color: stroke.color,
        width: stroke.width,
        points: stroke.points,
      });
    }

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handlePointerLeave = () => {
    // End stroke if we leave the canvas
    if (isDrawing.current) {
      isDrawing.current = false;
      const stroke = endStroke();

      if (stroke && stroke.points.length > 0) {
        wsClient.sendDrawEvent('stroke', {
          color: stroke.color,
          width: stroke.width,
          points: stroke.points,
        });
      }
    }
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
      />
    </div>
  );
}

