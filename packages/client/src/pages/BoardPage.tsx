import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import UserListCard from '../components/UserListCard';
import Canvas from '../components/Canvas';
import { wsClient } from '../ws/client';
import { usePresenceStore } from '../stores/presence';
import { getOrCreateIdentity } from '../stores/identity';
import type { ServerMessage } from '@witeboard/shared';
import styles from './BoardPage.module.css';

interface BoardPageProps {
  boardId?: string;
}

export default function BoardPage({ boardId: propBoardId }: BoardPageProps) {
  const { boardId: paramBoardId } = useParams<{ boardId: string }>();
  const boardId = propBoardId || paramBoardId || 'global';

  const setCurrentUser = usePresenceStore((state) => state.setCurrentUser);
  const setUserList = usePresenceStore((state) => state.setUserList);
  const addUser = usePresenceStore((state) => state.addUser);
  const removeUser = usePresenceStore((state) => state.removeUser);
  const clearPresence = usePresenceStore((state) => state.clearPresence);

  useEffect(() => {
    const identity = getOrCreateIdentity();

    // Subscribe to messages
    const unsubscribe = wsClient.subscribe((message: ServerMessage) => {
      switch (message.type) {
        case 'WELCOME':
          setCurrentUser({
            userId: message.payload.userId,
            displayName: message.payload.displayName,
            isAnonymous: true,
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
      }
    });

    // Connect to board
    wsClient.connect(boardId, identity);

    return () => {
      unsubscribe();
      clearPresence();
      wsClient.disconnect();
    };
  }, [boardId, setCurrentUser, setUserList, addUser, removeUser, clearPresence]);

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

