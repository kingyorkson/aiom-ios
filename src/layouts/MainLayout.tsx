import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useTheme } from '../context/ThemeContext';
import { Activity } from 'lucide-react';
import RunningProcesses from '../components/RunningProcesses';

const MainLayout: React.FC = () => {
  const { theme } = useTheme();
  const [showProcs, setShowProcs] = useState(false);

  const bgClass = theme === 'fancy'
    ? "bg-gradient-to-br from-aiom-bg to-[#2c2c45] text-aiom-text"
    : "bg-[#1a1a1a] bg-[url('https://assets.ppy.sh/beatmaps/12345/bg.jpg')] bg-blend-overlay text-white";

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${bgClass}`}>
      <TopBar />
      <div className="flex-1 overflow-auto p-4">
        <div className="scale-[0.92] origin-top-left w-[108.7%] h-[108.7%]">
          <Outlet />
        </div>
      </div>
      <button
        onClick={() => setShowProcs(true)}
        className={`fixed bottom-4 right-4 p-3 rounded-full shadow-lg ${theme === 'fancy' ? 'bg-green-600' : 'bg-[#8b8b8b]'}`}
        title="Background Processes"
      >
        <Activity size={20} />
      </button>
      {showProcs && <RunningProcesses onClose={() => setShowProcs(false)} />}
    </div>
  );
};

export default MainLayout;
