/**
 * List of animals for anonymous user names
 */
const ANIMALS = [
  'Tiger', 'Falcon', 'Dolphin', 'Wolf', 'Eagle', 'Bear', 'Fox', 'Hawk',
  'Lion', 'Panther', 'Raven', 'Shark', 'Cobra', 'Lynx', 'Orca', 'Viper',
  'Phoenix', 'Dragon', 'Griffin', 'Pegasus', 'Kraken', 'Hydra', 'Sphinx',
  'Unicorn', 'Chimera', 'Manticore', 'Basilisk', 'Wyvern', 'Cerberus'
];

/**
 * List of colors for avatar/cursor colors
 */
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
  '#FF7F50', '#9370DB', '#20B2AA', '#FF69B4', '#00FA9A', '#FFD700'
];

/**
 * Generate a random anonymous display name
 */
export function generateAnonymousName(): string {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `Anonymous ${animal}`;
}

/**
 * Generate a consistent color from a user ID
 */
export function generateAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Throttle function - limits how often a function can be called
 */
export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Args) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * Calculate perpendicular distance from a point to a line segment
 */
function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // Line segment is a point
  if (dx === 0 && dy === 0) {
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }

  // Calculate perpendicular distance using cross product
  const numerator = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(dx * dx + dy * dy);

  return numerator / denominator;
}

/**
 * Douglas-Peucker line simplification algorithm
 * Reduces the number of points in a stroke while preserving visual fidelity.
 * 
 * @param points - Array of [x, y] coordinate pairs
 * @param epsilon - Maximum perpendicular distance tolerance (default: 1.0 pixel)
 * @returns Simplified array of points
 * 
 * Performance: Reduces ~120 points (2s stroke at 60Hz) to ~15-20 points
 */
export function simplifyStroke(
  points: [number, number][],
  epsilon: number = 1.0
): [number, number][] {
  if (points.length <= 2) {
    return points;
  }

  // Find the point with maximum distance from the line between first and last
  let maxDistance = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance exceeds epsilon, recursively simplify
  if (maxDistance > epsilon) {
    const left = simplifyStroke(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyStroke(points.slice(maxIndex), epsilon);

    // Combine results (avoiding duplicate point at maxIndex)
    return [...left.slice(0, -1), ...right];
  }

  // All points between first and last are within tolerance - keep only endpoints
  return [first, last];
}

