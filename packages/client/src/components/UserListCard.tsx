import { usePresenceStore } from '../stores/presence';
import styles from './UserListCard.module.css';

export default function UserListCard() {
  const users = usePresenceStore((state) => state.users);
  const currentUser = usePresenceStore((state) => state.currentUser);

  const userList = Array.from(users.values());

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Online</span>
        <span className={styles.count}>{userList.length}</span>
      </div>
      
      <div className={styles.list}>
        {userList.length === 0 ? (
          <div className={styles.empty}>No users online</div>
        ) : (
          userList.map((user) => (
            <div
              key={user.userId}
              className={`${styles.user} ${user.userId === currentUser?.userId ? styles.isCurrentUser : ''}`}
            >
              <span
                className={styles.dot}
                style={{ backgroundColor: user.avatarColor }}
              />
              <span className={styles.name}>
                {user.displayName}
                {user.userId === currentUser?.userId && (
                  <span className={styles.you}>(you)</span>
                )}
              </span>
              {user.isAnonymous && (
                <span className={styles.badge}>anon</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

