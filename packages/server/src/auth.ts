import { verifyToken } from '@clerk/backend';

// Clerk secret key for token verification
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

/**
 * Verify a Clerk session token and return the user ID
 * Returns null if token is invalid or Clerk is not configured
 */
export async function verifyClerkToken(token: string | undefined): Promise<string | null> {
  if (!token) {
    return null;
  }

  if (!clerkSecretKey) {
    console.warn('CLERK_SECRET_KEY not configured, skipping token verification');
    return null;
  }

  try {
    // Verify the session token using the standalone function
    const verified = await verifyToken(token, {
      secretKey: clerkSecretKey,
    });
    return verified.sub; // sub is the user ID
  } catch (error) {
    console.error('Failed to verify Clerk token:', error);
    return null;
  }
}

/**
 * Check if Clerk authentication is configured
 */
export function isClerkConfigured(): boolean {
  return !!clerkSecretKey;
}

