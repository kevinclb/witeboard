import { create } from 'zustand';
import type { PresenceState, UserIdentity } from '@witeboard/shared';

interface PresenceStore {
  // Current user identity (set after WELCOME)
  currentUser: UserIdentity | null;
  
  // Users on the current board
  users: Map<string, PresenceState>;
  
  // Cursors (separate for fast updates)
  cursors: Map<string, { x: number; y: number; displayName: string; avatarColor?: string }>;
  
  // Actions
  setCurrentUser: (user: UserIdentity) => void;
  setUserList: (users: PresenceState[]) => void;
  addUser: (user: PresenceState) => void;
  removeUser: (userId: string) => void;
  updateCursor: (userId: string, x: number, y: number, displayName: string, avatarColor?: string) => void;
  clearPresence: () => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  currentUser: null,
  users: new Map(),
  cursors: new Map(),

  setCurrentUser: (user) => set({ currentUser: user }),

  setUserList: (users) => set({
    users: new Map(users.map(u => [u.userId, u])),
  }),

  addUser: (user) => set((state) => {
    const newUsers = new Map(state.users);
    newUsers.set(user.userId, user);
    return { users: newUsers };
  }),

  removeUser: (userId) => set((state) => {
    const newUsers = new Map(state.users);
    newUsers.delete(userId);
    const newCursors = new Map(state.cursors);
    newCursors.delete(userId);
    return { users: newUsers, cursors: newCursors };
  }),

  updateCursor: (userId, x, y, displayName, avatarColor) => set((state) => {
    const newCursors = new Map(state.cursors);
    newCursors.set(userId, { x, y, displayName, avatarColor });
    return { cursors: newCursors };
  }),

  clearPresence: () => set({
    users: new Map(),
    cursors: new Map(),
  }),
}));

