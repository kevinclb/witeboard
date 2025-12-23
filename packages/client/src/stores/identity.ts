import { generateUUID, generateAnonymousName } from '@witeboard/shared';

const STORAGE_KEY = 'witeboard_identity';

interface StoredIdentity {
  clientId: string;
  displayName: string;
}

/**
 * Get or create a persistent anonymous identity
 */
export function getOrCreateIdentity(): StoredIdentity {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as StoredIdentity;
      if (parsed.clientId && parsed.displayName) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Create new identity
  const identity: StoredIdentity = {
    clientId: generateUUID(),
    displayName: generateAnonymousName(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Ignore storage errors
  }

  return identity;
}

/**
 * Clear stored identity (for logout)
 */
export function clearIdentity(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

