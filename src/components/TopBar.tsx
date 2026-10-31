import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Package, Globe, Settings, Sliders, Database, AlertCircle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const TopBar: React.FC = () => {
  const { theme } = useTheme();
  const [showMcAlert, setShowMcAlert] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        if (!(window.electronAPI as any)?.getGlobalConfig) return;
        const config = await (window.electronAPI as any).getGlobalConfig?.();
        if (!config) return;
        const hasAccounts = Array.isArray(config?.accounts) && config.accounts.length > 0;
        const hasOffline = !!config?.offlineName;
        if (!(config?.minecraftVerified) && !(hasAccounts || hasOffline)) {
          setShowMcAlert(true);
        }
      } catch {}
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { name: 'Mod Packs', path: '/', icon: Package },
    { name: 'Browse', path: '/browse', icon: Globe },
    { name: 'NBT Editor', path: '/nbt-editor', icon: Database },
    { name: 'Minecraft Settings', path: '/mc-settings', icon: Sliders, alert: showMcAlert },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const baseClass = "flex items-center space-x-4 p-4 transition-all duration-300";
  const themeClass = theme === 'fancy' 
    ? "bg-aiom-sidebar/90 backdrop-blur-md shadow-lg rounded-b-2xl mx-4 mt-2 text-white" 
    : "bg-[#c6c6c6] border-b-4 border-[#555555] text-black";

  const linkBase = "flex items-center gap-2 px-4 py-2 transition-all duration-200";
  const linkFancy = "rounded-xl hover:bg-white/10 hover:scale-105 active:scale-95";
  const linkDefault = "border-2 border-transparent hover:border-white hover:bg-[#8b8b8b] hover:text-white active:bg-[#555555]";
  const activeFancy = "bg-aiom-accent text-aiom-bg font-bold shadow-md";
  const activeDefault = "bg-[#8b8b8b] text-white border-[#555555] inset-shadow";

  return (
    <div className={`${baseClass} ${themeClass}`}>
      <div className="text-xl font-bold mr-8 tracking-wider">
        AIOM
      </div>
      <nav className="flex space-x-2">
        {navItems.map((item: any) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              ${linkBase}
              ${theme === 'fancy' ? linkFancy : linkDefault}
              ${isActive ? (theme === 'fancy' ? activeFancy : activeDefault) : ''}
            `}
          >
            <item.icon size={20} />
            <span>{item.name}</span>
            {(item.alert) && <AlertCircle size={16} className="text-yellow-500" />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default TopBar;
