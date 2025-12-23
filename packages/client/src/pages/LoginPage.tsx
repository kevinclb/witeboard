import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <Navbar />
      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.icon}>🔐</div>
          <h1 className={styles.title}>Sign In</h1>
          <p className={styles.description}>
            Authentication is coming soon! For now, you're using an anonymous account
            that persists in your browser.
          </p>
          <Link to="/" className={styles.button}>
            Return to Whiteboard
          </Link>
        </div>
      </main>
    </div>
  );
}

