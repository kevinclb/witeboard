import { useState, useCallback, useEffect } from 'react';
import type { ToolType } from '@witeboard/shared';
import {
  setTool,
  setColor,
  setFontSize,
  getCurrentTool,
  getCurrentColor,
  getCurrentFontSize,
  COLOR_PALETTE,
  FONT_SIZES,
  canUndo,
} from '../canvas/state';
import styles from './ToolPalette.module.css';

interface ToolPaletteProps {
  onToolChange?: (tool: ToolType) => void;
  onUndo?: () => void;
}

interface ToolDef {
  type: ToolType;
  label: string;
  icon: JSX.Element;
}

// Primary tools - always visible
const PRIMARY_TOOLS: ToolDef[] = [
  {
    type: 'move',
    label: 'Move / Pan',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 9l-3 3 3 3" />
        <path d="M9 5l3-3 3 3" />
        <path d="M15 19l-3 3-3-3" />
        <path d="M19 9l3 3-3 3" />
        <path d="M2 12h20" />
        <path d="M12 2v20" />
      </svg>
    ),
  },
  {
    type: 'pencil',
    label: 'Pencil',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    ),
  },
  {
    type: 'text',
    label: 'Text',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7V4h16v3" />
        <path d="M12 4v16" />
        <path d="M8 20h8" />
      </svg>
    ),
  },
  {
    type: 'eraser',
    label: 'Eraser',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1l10-10c.6-.6 1.5-.6 2.1 0l6.9 6.9c.6.6.6 1.5 0 2.1L14 21" />
        <path d="M18 13l-8-8" />
        <path d="M7 20h13" />
      </svg>
    ),
  },
];

// Secondary tools - shown when expanded
const SECONDARY_TOOLS: ToolDef[] = [
  {
    type: 'marker',
    label: 'Marker',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <path d="M11 11l-4.5 4.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: 'brush',
    label: 'Brush',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
        <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
      </svg>
    ),
  },
  {
    type: 'line',
    label: 'Line',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="5" y1="19" x2="19" y2="5" />
      </svg>
    ),
  },
  {
    type: 'rectangle',
    label: 'Rectangle',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    type: 'ellipse',
    label: 'Ellipse',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="12" rx="10" ry="8" />
      </svg>
    ),
  },
];

export default function ToolPalette({ onToolChange, onUndo }: ToolPaletteProps) {
  const [activeTool, setActiveTool] = useState<ToolType>(getCurrentTool());
  const [activeColor, setActiveColor] = useState<string>(getCurrentColor());
  const [activeFontSize, setActiveFontSize] = useState<number>(getCurrentFontSize());
  const [isExpanded, setIsExpanded] = useState(false);
  const [isColorsExpanded, setIsColorsExpanded] = useState(false);

  // Notify parent of initial tool on mount (important for mobile default)
  useEffect(() => {
    onToolChange?.(activeTool);
  }, []);

  const handleToolClick = useCallback((tool: ToolType) => {
    setTool(tool);
    setActiveTool(tool);
    onToolChange?.(tool);
  }, [onToolChange]);

  const handleColorClick = useCallback((color: string) => {
    setColor(color);
    setActiveColor(color);
  }, []);

  const handleFontSizeClick = useCallback((size: number) => {
    setFontSize(size);
    setActiveFontSize(size);
  }, []);

  // Check if current tool supports color (eraser and move don't)
  const supportsColor = activeTool !== 'eraser' && activeTool !== 'move';
  // Check if text tool is selected
  const isTextTool = activeTool === 'text';
  // Check if a secondary tool is active (should auto-expand)
  const isSecondaryActive = SECONDARY_TOOLS.some(t => t.type === activeTool);
  // Check if current color needs dark icon (light colors)
  const needsDarkIcon = ['#ffffff', '#ffd43b', '#69db7c'].includes(activeColor);

  // Auto-expand if secondary tool is selected
  useEffect(() => {
    if (isSecondaryActive) {
      setIsExpanded(true);
    }
  }, [isSecondaryActive]);

  const renderToolButton = ({ type, label, icon }: ToolDef) => (
    <button
      key={type}
      className={`${styles.toolButton} ${activeTool === type ? styles.active : ''}`}
      onClick={() => handleToolClick(type)}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div className={styles.palette}>
      {/* Undo button */}
      <button
        className={styles.undoButton}
        onClick={onUndo}
        title="Undo (Ctrl+Z)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>

      <div className={styles.divider} />

      {/* Primary tools - always visible */}
      <div className={styles.tools}>
        {PRIMARY_TOOLS.map(renderToolButton)}
      </div>

      {/* Expand/collapse button */}
      <button
        className={`${styles.expandButton} ${isExpanded ? styles.expanded : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? 'Show fewer tools' : 'Show more tools'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isExpanded ? (
            <path d="M18 15l-6-6-6 6" />
          ) : (
            <path d="M6 9l6 6 6-6" />
          )}
        </svg>
      </button>

      {/* Secondary tools - shown when expanded */}
      {isExpanded && (
        <div className={styles.tools}>
          {SECONDARY_TOOLS.map(renderToolButton)}
        </div>
      )}

      <div className={styles.divider} />

      {/* Font size section (only for text tool) */}
      {isTextTool && (
        <>
          <div className={styles.fontSizes}>
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                className={`${styles.fontSizeButton} ${activeFontSize === size ? styles.active : ''}`}
                onClick={() => handleFontSizeClick(size)}
                title={`${size}px`}
              >
                {size}
              </button>
            ))}
          </div>
          <div className={styles.divider} />
        </>
      )}

      {/* Colors section */}
      <div className={styles.colorSection}>
        {/* Current color indicator (always visible) */}
        <button
          className={`${styles.currentColor} ${!supportsColor ? styles.disabled : ''}`}
          onClick={() => supportsColor && setIsColorsExpanded(!isColorsExpanded)}
          title={supportsColor ? (isColorsExpanded ? 'Hide colors' : 'Choose color') : 'Color not available'}
          disabled={!supportsColor}
          style={{ 
            backgroundColor: activeColor,
            borderColor: activeColor === '#1a1a1a' ? '#333' : activeColor 
          }}
        >
          {supportsColor && (
            <svg 
              className={`${styles.colorExpandIcon} ${isColorsExpanded ? styles.expanded : ''} ${needsDarkIcon ? styles.darkIcon : ''}`}
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </button>

        {/* Expanded color palette */}
        {isColorsExpanded && supportsColor && (
          <div className={styles.colors}>
            {COLOR_PALETTE.filter(c => c !== activeColor).map((color) => (
              <button
                key={color}
                className={styles.colorButton}
                onClick={() => {
                  handleColorClick(color);
                  setIsColorsExpanded(false);
                }}
                title={color}
                style={{ 
                  backgroundColor: color,
                  borderColor: color === '#1a1a1a' ? '#333' : color 
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
