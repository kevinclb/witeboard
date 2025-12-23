import { Link } from 'react-router-dom';
import { usePresenceStore } from '../stores/presence';
import styles from './Navbar.module.css';

export default function Navbar() {
  const currentUser = usePresenceStore((state) => state.currentUser);

  return (
    <nav className={styles.navbar}>
      <div className={styles.left}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoIcon}>▢</span>
          <span className={styles.logoText}>witeboard</span>
        </Link>
      </div>

      <div className={styles.right}>
        {currentUser ? (
          <div className={styles.user}>
            <span
              className={styles.avatar}
              style={{ backgroundColor: currentUser.avatarColor }}
            />
            <span className={styles.userName}>{currentUser.displayName}</span>
          </div>
        ) : null}
        <Link to="/login" className={styles.loginBtn}>
          {currentUser?.isAnonymous !== false ? 'Sign In' : 'Account'}
        </Link>
      </div>
    </nav>
  );
}

