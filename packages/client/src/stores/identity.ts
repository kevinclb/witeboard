import { generateUUID, generateAnonymousName } from '@witeboard/shared';

const STORAGE_KEY = 'witeboard_identity';

export interface StoredIdentity {
  clientId: string;
  displayName: string;
  isAnonymous: boolean;
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
        // Ensure isAnonymous is set
        return {
          ...parsed,
          isAnonymous: parsed.isAnonymous ?? true,
        };
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Create new anonymous identity
  const identity: StoredIdentity = {
    clientId: generateUUID(),
    displayName: generateAnonymousName(),
    isAnonymous: true,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Ignore storage errors
  }

  return identity;
}

/**
 * Update identity with Clerk user info
 */
export function updateIdentityWithClerkUser(
  clerkUserId: string, 
  displayName: string
): StoredIdentity {
  const identity: StoredIdentity = {
    clientId: clerkUserId,
    displayName,
    isAnonymous: false,
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

