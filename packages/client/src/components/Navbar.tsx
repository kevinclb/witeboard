import { Link } from 'react-router-dom';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { usePresenceStore } from '../stores/presence';
import { clerkAppearance } from '../styles/clerkTheme';
import styles from './Navbar.module.css';

// Check if Clerk is configured via environment variable
const CLERK_AVAILABLE = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function Navbar() {
  const currentUser = usePresenceStore((state) => state.currentUser);
  
  // Only use Clerk hooks if available
  const { isSignedIn } = CLERK_AVAILABLE 
    ? useUser() 
    : { isSignedIn: false };

  return (
    <nav className={styles.navbar}>
      <div className={styles.left}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoIcon}>▢</span>
          <span className={styles.logoText}>witeboard</span>
        </Link>
      </div>

      <div className={styles.right}>
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
  );
}

