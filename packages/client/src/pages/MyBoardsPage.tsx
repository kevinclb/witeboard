import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useUser, SignInButton } from '@clerk/clerk-react';
import Navbar from '../components/Navbar';
import { clerkAppearance } from '../styles/clerkTheme';
import type { Board } from '@witeboard/shared';
import styles from './MyBoardsPage.module.css';

// Check if Clerk is configured via environment variable
const CLERK_AVAILABLE = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// API base URL
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export default function MyBoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false); // Prevent infinite retry
  const navigate = useNavigate();

  // Only use Clerk hooks if available
  const { isSignedIn, isLoaded } = CLERK_AVAILABLE ? useUser() : { isSignedIn: false, isLoaded: true };
  const clerkAuth = CLERK_AVAILABLE ? useAuth() : null;

  // Fetch user's boards
  const fetchBoards = useCallback(async () => {
    if (!clerkAuth?.isSignedIn) return;

    try {
      setLoading(true);
      setError(null);

      const token = await clerkAuth.getToken();
      if (!token) {
        throw new Error('Failed to get auth token');
      }

      const response = await fetch(`${API_BASE}/api/boards`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch boards');
      }

      const data = await response.json();
      setBoards(data.boards);
    } catch (err) {
      console.error('Error fetching boards:', err);
      setError('Failed to load your boards');
    } finally {
      setLoading(false);
    }
  }, [clerkAuth?.isSignedIn, clerkAuth?.getToken]);

  // Delete a board
  const handleDelete = useCallback(async (boardId: string, boardName: string) => {
    if (!clerkAuth?.isSignedIn) return;

    const confirmed = window.confirm(`Are you sure you want to delete "${boardName}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const token = await clerkAuth.getToken();
      if (!token) {
        throw new Error('Failed to get auth token');
      }

      const response = await fetch(`${API_BASE}/api/boards/${boardId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete board');
      }

      // Remove from local state
      setBoards(boards.filter(b => b.id !== boardId));
    } catch (err) {
      console.error('Error deleting board:', err);
      alert('Failed to delete board');
    }
  }, [clerkAuth, boards]);

  useEffect(() => {
    // Only fetch once per mount to prevent infinite retry loops
    if (hasFetched.current) return;
    
    if (isLoaded && isSignedIn) {
      hasFetched.current = true;
      fetchBoards();
    } else if (isLoaded && !isSignedIn) {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, fetchBoards]);

  // Wait for Clerk to load
  if (!isLoaded) {
    return (
      <div className={styles.container}>
        <Navbar />
        <main className={styles.main}>
          <div className={styles.loading}>Loading...</div>
        </main>
      </div>
    );
  }

  // Not signed in
  if (!CLERK_AVAILABLE || !isSignedIn) {
    return (
      <div className={styles.container}>
        <Navbar />
        <main className={styles.main}>
          <div className={styles.notSignedIn}>
            <div className={styles.notSignedInIcon}>🔐</div>
            <h1 className={styles.notSignedInTitle}>Sign In Required</h1>
            <p className={styles.notSignedInText}>
              Sign in to view and manage your private whiteboards.
            </p>
            {CLERK_AVAILABLE && (
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
        <div className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.title}>My Boards</h1>
            <p className={styles.subtitle}>Your private whiteboards</p>
          </header>

          {loading ? (
            <div className={styles.loading}>Loading your boards...</div>
          ) : error ? (
            <div className={styles.error}>
              <p>{error}</p>
              <button onClick={() => { hasFetched.current = false; fetchBoards(); }} className={styles.retryBtn}>
                Try Again
              </button>
            </div>
          ) : boards.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>📋</div>
              <h2 className={styles.emptyTitle}>No boards yet</h2>
              <p className={styles.emptyText}>
                Create your first private whiteboard to get started.
              </p>
            </div>
          ) : (
            <div className={styles.boardGrid}>
              {boards.map((board) => (
                <div key={board.id} className={styles.boardCard}>
                  <Link to={`/b/${board.id}`} className={styles.boardLink}>
                    <div className={styles.boardPreview}>
                      <span className={styles.boardIcon}>▢</span>
                    </div>
                    <div className={styles.boardInfo}>
                      <h3 className={styles.boardName}>
                        {board.isPrivate && <span className={styles.privateIcon}>🔒</span>}
                        {board.name || 'Untitled Board'}
                      </h3>
                      <p className={styles.boardDate}>
                        Created {new Date(board.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                  <button 
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(board.id, board.name || 'Untitled Board')}
                    title="Delete board"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

