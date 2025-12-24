import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SignInButton } from '@clerk/clerk-react';
import Navbar from '../components/Navbar';
import UserListCard from '../components/UserListCard';
import Canvas from '../components/Canvas';
import { wsClient } from '../ws/client';
import { usePresenceStore } from '../stores/presence';
import { useClerkAuth } from '../hooks/useClerkAuth';
import { clerkAppearance } from '../styles/clerkTheme';
import type { ServerMessage } from '@witeboard/shared';
import styles from './BoardPage.module.css';

// Check if Clerk is configured via environment variable
const CLERK_AVAILABLE = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface BoardPageProps {
  boardId?: string;
}

interface AccessDeniedState {
  denied: boolean;
  reason: string;
}

export default function BoardPage({ boardId: propBoardId }: BoardPageProps) {
  const { boardId: paramBoardId } = useParams<{ boardId: string }>();
  const boardId = propBoardId || paramBoardId || 'global';

  const { identity, isReady, isSignedIn } = useClerkAuth();
  const [accessDenied, setAccessDenied] = useState<AccessDeniedState>({ denied: false, reason: '' });

  const setCurrentUser = usePresenceStore((state) => state.setCurrentUser);
  const setUserList = usePresenceStore((state) => state.setUserList);
  const addUser = usePresenceStore((state) => state.addUser);
  const removeUser = usePresenceStore((state) => state.removeUser);
  const clearPresence = usePresenceStore((state) => state.clearPresence);

  useEffect(() => {
    // Wait for auth to be ready
    if (!isReady) {
      return;
    }

    // Reset access denied on board change
    setAccessDenied({ denied: false, reason: '' });

    // Subscribe to messages
    const unsubscribe = wsClient.subscribe((message: ServerMessage) => {
      switch (message.type) {
        case 'WELCOME':
          setCurrentUser({
            userId: message.payload.userId,
            displayName: message.payload.displayName,
            isAnonymous: identity.isAnonymous,
            avatarColor: message.payload.avatarColor,
          });
          break;
        case 'USER_LIST':
          setUserList(message.payload.users);
          break;
        case 'USER_JOIN':
          addUser(message.payload.user);
          break;
        case 'USER_LEAVE':
          removeUser(message.payload.userId);
          break;
        case 'ACCESS_DENIED':
          setAccessDenied({ 
            denied: true, 
            reason: message.payload.reason 
          });
          break;
      }
    });

    // Connect to board
    wsClient.connect(boardId, identity);

    return () => {
      unsubscribe();
      clearPresence();
      wsClient.disconnect();
    };
  }, [boardId, identity, isReady, setCurrentUser, setUserList, addUser, removeUser, clearPresence]);

  // Show loading while auth is being determined
  if (!isReady) {
    return (
      <div className={styles.container}>
        <Navbar />
        <main className={styles.main}>
          <div className={styles.loading}>Loading...</div>
        </main>
      </div>
    );
  }

  // Show access denied screen
  if (accessDenied.denied) {
    return (
      <div className={styles.container}>
        <Navbar />
        <main className={styles.main}>
          <div className={styles.accessDenied}>
            <div className={styles.accessDeniedIcon}>🔒</div>
            <h1 className={styles.accessDeniedTitle}>Access Denied</h1>
            <p className={styles.accessDeniedReason}>{accessDenied.reason}</p>
            {!isSignedIn && CLERK_AVAILABLE && (
              <SignInButton mode="modal" appearance={clerkAppearance}>
                <button className={styles.signInBtn}>Sign In</button>
              </SignInButton>
            )}
            <Link to="/" className={styles.homeLink}>
              ← Return to Global Whiteboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Navbar />
      <main className={styles.main}>
        <Canvas boardId={boardId} />
        <UserListCard />
      </main>
    </div>
  );
}

