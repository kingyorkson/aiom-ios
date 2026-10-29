import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import ModPacks from './pages/ModPacks';
import Browse from './pages/Browse';
import MCSettings from './pages/MCSettings';
import Settings from './pages/Settings';
import ModPackDetails from './pages/ModPackDetails';
import AddContent from './pages/AddContent';
import NBTEditor from './pages/NBTEditor';
import Tutorial from './components/Tutorial';
import { ThemeProvider } from './context/ThemeContext';
import BootAnimation from './components/BootAnimation';

const AppContent: React.FC = () => {
  const [showTutorial, setShowTutorial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBoot, setShowBoot] = useState(true);

  useEffect(() => {
    checkTutorial();
    const timer = setTimeout(() => setShowBoot(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  const checkTutorial = async () => {
    try {
      const isDone = await window.electronAPI.checkTutorial();
      setShowTutorial(!isDone);
    } catch (e) {
      console.error("Failed to check tutorial status", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTutorialComplete = async () => {
    await window.electronAPI.completeTutorial();
    setShowTutorial(false);
  };

  if (loading) return null;

  return (
    <>
      {showBoot && <BootAnimation />}
      {showTutorial && <Tutorial onComplete={handleTutorialComplete} />}
      <Router>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<ModPacks />} />
            <Route path="browse" element={<Browse />} />
            <Route path="mc-settings" element={<MCSettings />} />
            <Route path="settings" element={<Settings />} />
            <Route path="nbt-editor" element={<NBTEditor />} />
            <Route path="modpack/:name" element={<ModPackDetails />} />
            <Route path="modpack/:packName/add-content" element={<AddContent />} />
          </Route>
        </Routes>
      </Router>
    </>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
