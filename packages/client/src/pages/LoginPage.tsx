import { Link, Navigate } from 'react-router-dom';
import { SignIn, useUser } from '@clerk/clerk-react';
import Navbar from '../components/Navbar';
import { clerkAppearance } from '../styles/clerkTheme';
import styles from './LoginPage.module.css';

// Check if Clerk is configured via environment variable
const CLERK_AVAILABLE = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function LoginPage() {
  // Only call useUser if Clerk is available
  const { isSignedIn } = CLERK_AVAILABLE ? useUser() : { isSignedIn: false };

  // Redirect to home if already signed in
  if (CLERK_AVAILABLE && isSignedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={styles.container}>
      <Navbar />
      <main className={styles.main}>
        {CLERK_AVAILABLE ? (
          <SignIn 
            routing="hash"
            signUpUrl="/login"
            appearance={clerkAppearance}
          />
        ) : (
          <div className={styles.card}>
            <div className={styles.icon}>🔐</div>
            <h1 className={styles.title}>Sign In</h1>
            <p className={styles.description}>
              Authentication is not configured. Add your Clerk publishable key to enable sign-in.
            </p>
            <p className={styles.hint}>
              Copy <code>env.example</code> to <code>.env</code> and add your key.
            </p>
            <Link to="/" className={styles.button}>
              Return to Whiteboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

