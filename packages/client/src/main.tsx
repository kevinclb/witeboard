import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './styles/global.css';

// Get Clerk publishable key from environment
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Clerk is optional - app works without it (anonymous users)
const AppWithProviders = () => (
  <React.StrictMode>
    <BrowserRouter>
      {clerkPubKey ? (
        <ClerkProvider publishableKey={clerkPubKey}>
          <App />
        </ClerkProvider>
      ) : (
        <App />
      )}
    </BrowserRouter>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')!).render(<AppWithProviders />);

