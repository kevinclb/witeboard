import { Routes, Route, Navigate } from 'react-router-dom';
import BoardPage from './pages/BoardPage';
import LoginPage from './pages/LoginPage';
import MyBoardsPage from './pages/MyBoardsPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<BoardPage boardId="global" />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/boards" element={<MyBoardsPage />} />
      <Route path="/b/:boardId" element={<BoardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

