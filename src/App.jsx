import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StartPage from './pages/StartPage';
import TeamPage from './pages/TeamPage';
import FugitivePage from './pages/FugitivePage';
import AdminPage from './pages/AdminPage';
import MapPage from './pages/MapPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/team/:gameCode" element={<TeamPage />} />
        <Route path="/fugitive/:gameCode" element={<FugitivePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/map/:gameCode" element={<MapPage />} />
      </Routes>
    </BrowserRouter>
  );
}
