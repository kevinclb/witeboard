import { useEffect, useState, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { wsClient } from '../ws/client';
import { 
  getOrCreateIdentity, 
  updateIdentityWithClerkUser, 
  type StoredIdentity 
} from '../stores/identity';

// Check if Clerk is configured via environment variable
const CLERK_AVAILABLE = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Hook to manage authentication state and get session tokens
 */
export function useClerkAuth() {
  const [identity, setIdentity] = useState<StoredIdentity>(getOrCreateIdentity);
  const [isReady, setIsReady] = useState(!CLERK_AVAILABLE);

  // Only use Clerk hooks if available
  const clerkAuth = CLERK_AVAILABLE ? useAuth() : null;
  const clerkUser = CLERK_AVAILABLE ? useUser() : null;

  // Sync identity with Clerk user
  useEffect(() => {
    if (!CLERK_AVAILABLE) {
      setIdentity(getOrCreateIdentity());
      setIsReady(true);
      return;
    }

    if (!clerkUser?.isLoaded) {
      return; // Wait for Clerk to load
    }

    if (clerkUser.isSignedIn && clerkUser.user) {
      // Update identity with Clerk user info
      const displayName = 
        clerkUser.user.username || 
        clerkUser.user.fullName || 
        `User ${clerkUser.user.id.slice(-4)}`;
      const newIdentity = updateIdentityWithClerkUser(clerkUser.user.id, displayName);
      setIdentity(newIdentity);
    } else {
      // Anonymous user
      setIdentity(getOrCreateIdentity());
    }

    setIsReady(true);
  }, [clerkUser?.isLoaded, clerkUser?.isSignedIn, clerkUser?.user?.id]);

  // Get and set auth token for WebSocket
  useEffect(() => {
    if (!CLERK_AVAILABLE || !clerkAuth?.isLoaded) {
      return;
    }

    const updateToken = async () => {
      if (clerkAuth.isSignedIn) {
        try {
          const token = await clerkAuth.getToken();
          wsClient.setAuthToken(token);
        } catch (error) {
          console.error('Failed to get Clerk token:', error);
          wsClient.setAuthToken(null);
        }
      } else {
        wsClient.setAuthToken(null);
      }
    };

    updateToken();
  }, [clerkAuth?.isLoaded, clerkAuth?.isSignedIn]);

  // Function to get a fresh token (for create board, etc.)
  const getToken = useCallback(async (): Promise<string | null> => {
    if (!CLERK_AVAILABLE || !clerkAuth) {
      return null;
    }

    if (!clerkAuth.isSignedIn) {
      return null;
    }

    try {
      return await clerkAuth.getToken();
    } catch (error) {
      console.error('Failed to get Clerk token:', error);
      return null;
    }
  }, [clerkAuth]);

  return {
    identity,
    isReady,
    isSignedIn: CLERK_AVAILABLE ? clerkAuth?.isSignedIn ?? false : false,
    getToken,
  };
}

