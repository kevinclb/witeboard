import type { Appearance } from '@clerk/types';

/**
 * Custom Clerk theme to match Witeboard's dark aesthetic
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: '#3b82f6',
    colorBackground: '#141414',
    colorInputBackground: '#1a1a1a',
    colorInputText: '#f5f5f5',
    colorText: '#f5f5f5',
    colorTextSecondary: '#a0a0a0',
    colorDanger: '#ef4444',
    colorSuccess: '#22c55e',
    colorWarning: '#f59e0b',
    fontFamily: "'JetBrains Mono', monospace",
    fontFamilyButtons: "'JetBrains Mono', monospace",
    borderRadius: '8px',
    colorNeutral: '#2a2a2a',
  },
  elements: {
    rootBox: {
      fontFamily: "'JetBrains Mono', monospace",
    },
    card: {
      background: '#141414',
      border: '1px solid #2a2a2a',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      borderRadius: '12px',
    },
    headerTitle: {
      color: '#f5f5f5',
      fontWeight: 600,
    },
    headerSubtitle: {
      color: '#a0a0a0',
    },
    socialButtonsBlockButton: {
      background: '#1a1a1a',
      border: '1px solid #2a2a2a',
      color: '#f5f5f5',
      fontWeight: 500,
    },
    socialButtonsBlockButtonText: {
      color: '#f5f5f5',
    },
    dividerLine: {
      background: '#2a2a2a',
    },
    dividerText: {
      color: '#666',
    },
    formFieldLabel: {
      color: '#a0a0a0',
      fontSize: '13px',
    },
    formFieldInput: {
      background: '#1a1a1a',
      border: '1px solid #2a2a2a',
      color: '#f5f5f5',
      borderRadius: '6px',
    },
    formButtonPrimary: {
      background: '#3b82f6',
      color: '#fff',
      fontWeight: 500,
      borderRadius: '6px',
    },
    footerActionLink: {
      color: '#3b82f6',
      fontWeight: 500,
    },
    footerActionText: {
      color: '#666',
    },
    identityPreview: {
      background: '#1a1a1a',
      border: '1px solid #2a2a2a',
      borderRadius: '6px',
    },
    identityPreviewText: {
      color: '#f5f5f5',
    },
    identityPreviewEditButton: {
      color: '#3b82f6',
    },
    userButtonPopoverCard: {
      background: '#141414',
      border: '1px solid #2a2a2a',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    },
    userButtonPopoverActionButton: {
      color: '#f5f5f5',
    },
    userButtonPopoverActionButtonText: {
      color: '#f5f5f5',
    },
    userButtonPopoverActionButtonIcon: {
      color: '#a0a0a0',
    },
    userButtonPopoverFooter: {
      background: '#0a0a0a',
      borderTop: '1px solid #2a2a2a',
    },
    modalBackdrop: {
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(4px)',
    },
  },
};

