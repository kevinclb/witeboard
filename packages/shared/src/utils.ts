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
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: unknown[]) => {
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
  }) as T;
}

