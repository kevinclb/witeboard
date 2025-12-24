import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SignInButton, UserButton, useUser, useAuth } from '@clerk/clerk-react';
import { usePresenceStore } from '../stores/presence';
import { clerkAppearance } from '../styles/clerkTheme';
import styles from './Navbar.module.css';

// Check if Clerk is configured via environment variable
const CLERK_AVAILABLE = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface CreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, isPrivate: boolean) => void;
}

function CreateBoardModal({ isOpen, onClose, onCreate }: CreateBoardModalProps) {
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(name || 'Untitled Board', isPrivate);
    setName('');
    setIsPrivate(true);
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Create New Board</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="boardName">Board Name</label>
            <input
              id="boardName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My awesome whiteboard"
              autoFocus
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <span className={styles.checkboxText}>
                🔒 Private (only you can access)
              </span>
            </label>
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.createBtn}>
              Create Board
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Navbar() {
  const currentUser = usePresenceStore((state) => state.currentUser);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  
  // Only use Clerk hooks if available
  const { isSignedIn } = CLERK_AVAILABLE ? useUser() : { isSignedIn: false };
  const clerkAuth = CLERK_AVAILABLE ? useAuth() : null;

  const handleCreateBoard = useCallback(async (name: string, isPrivate: boolean) => {
    if (!clerkAuth?.isSignedIn) {
      console.error('Cannot create board: not signed in');
      return;
    }

    try {
      // Get fresh token
      const token = await clerkAuth.getToken();
      if (!token) {
        console.error('Failed to get auth token');
        return;
      }

      // Use HTTP API to create board (works even when WebSocket isn't connected)
      const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
      const response = await fetch(`${API_BASE}/api/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, isPrivate }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create board');
      }

      const { board } = await response.json();
      console.log('Board created:', board.id);
      
      // Navigate to the new board
      navigate(`/b/${board.id}`);
    } catch (error) {
      console.error('Error creating board:', error);
    }
  }, [clerkAuth, navigate]);

  return (
    <>
      <nav className={styles.navbar}>
        <div className={styles.left}>
          <Link to="/" className={styles.logo}>
            <span className={styles.logoIcon}>▢</span>
            <span className={styles.logoText}>witeboard</span>
          </Link>
        </div>

        <div className={styles.right}>
          {/* New Board button (signed-in users only) */}
          {CLERK_AVAILABLE && isSignedIn && (
            <>
              <Link to="/boards" className={styles.myBoardsLink}>
                My Boards
              </Link>
              <button 
                className={styles.newBoardBtn}
                onClick={() => setIsModalOpen(true)}
              >
                + New Board
              </button>
            </>
          )}

          {/* Show current user info (anonymous or signed in) */}
          {currentUser && !isSignedIn && (
            <div className={styles.user}>
              <span
                className={styles.avatar}
                style={{ backgroundColor: currentUser.avatarColor }}
              />
              <span className={styles.userName}>{currentUser.displayName}</span>
            </div>
          )}

          {/* Clerk auth UI */}
          {CLERK_AVAILABLE ? (
            isSignedIn ? (
              <UserButton 
                afterSignOutUrl="/"
                appearance={clerkAppearance}
              />
            ) : (
              <SignInButton mode="modal" appearance={clerkAppearance}>
                <button className={styles.loginBtn}>Sign In</button>
              </SignInButton>
            )
          ) : (
            <Link to="/login" className={styles.loginBtn}>
              Sign In
            </Link>
          )}
        </div>
      </nav>

      <CreateBoardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateBoard}
      />
    </>
  );
}

