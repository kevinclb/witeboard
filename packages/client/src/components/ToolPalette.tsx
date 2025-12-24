import { useState, useCallback } from 'react';
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
} from '../canvas/state';
import styles from './ToolPalette.module.css';

interface ToolPaletteProps {
  onToolChange?: (tool: ToolType) => void;
}

// Tool definitions with icons (using simple SVG paths)
const TOOLS: { type: ToolType; label: string; icon: JSX.Element }[] = [
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

export default function ToolPalette({ onToolChange }: ToolPaletteProps) {
  const [activeTool, setActiveTool] = useState<ToolType>(getCurrentTool());
  const [activeColor, setActiveColor] = useState<string>(getCurrentColor());
  const [activeFontSize, setActiveFontSize] = useState<number>(getCurrentFontSize());

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

  // Check if current tool supports color (eraser doesn't)
  const supportsColor = activeTool !== 'eraser';
  // Check if text tool is selected
  const isTextTool = activeTool === 'text';

  return (
    <div className={styles.palette}>
      {/* Tools section */}
      <div className={styles.tools}>
        {TOOLS.map(({ type, label, icon }) => (
          <button
            key={type}
            className={`${styles.toolButton} ${activeTool === type ? styles.active : ''}`}
            onClick={() => handleToolClick(type)}
            title={label}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Divider */}
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
      <div className={styles.colors}>
        {COLOR_PALETTE.map((color) => (
          <button
            key={color}
            className={`${styles.colorButton} ${activeColor === color ? styles.active : ''} ${!supportsColor ? styles.disabled : ''}`}
            onClick={() => supportsColor && handleColorClick(color)}
            title={color}
            disabled={!supportsColor}
            style={{ 
              backgroundColor: color,
              borderColor: color === '#1a1a1a' ? '#333' : color 
            }}
          >
            {activeColor === color && supportsColor && (
              <span className={styles.colorCheck}>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

