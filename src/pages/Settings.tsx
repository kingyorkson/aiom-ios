import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Settings as SettingsIcon, Save } from 'lucide-react';

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // Mock Minecraft Options
  const [options, setOptions] = useState<any>({
    'fov': 90,
    'renderDistance': 12,
    'narrator': 0, // 0: off
    'tutorialStep': 'none',
    'gamma': 1.0,
    'fullscreen': 'false'
  });

  useEffect(() => {
    loadGlobalConfig();
  }, []);

  const loadGlobalConfig = async () => {
    const config = await window.electronAPI.getGlobalConfig();
    if (Object.keys(config).length > 0) {
      setOptions({ ...options, ...config });
    }
  };

  const handleSaveConfig = async () => {
    await window.electronAPI.saveGlobalConfig(options);
    setShowConfigModal(false);
  };

  const handleOptionChange = (key: string, value: any) => {
    setOptions({ ...options, [key]: value });
  };
  
  const handleLoginMicrosoft = async () => {
    setIsBusy(true);
    const res = await window.electronAPI.loginMicrosoft();
    setIsBusy(false);
    if (!res.success) {
      alert('Microsoft login failed: ' + (res.error || 'Unknown error'));
    }
    await loadGlobalConfig();
  };
  
  const handleAddOffline = async () => {
    const name = prompt('Enter offline username');
    if (!name) return;
    const res = await window.electronAPI.addOfflineAccount(name);
    if (!res.success) {
      alert('Failed to add offline account: ' + (res.error || 'Unknown error'));
    }
    await loadGlobalConfig();
  };
  
  const handleRemoveAccount = async (id: string) => {
    const res = await window.electronAPI.removeAccount(id);
    if (!res.success) {
      alert('Failed to remove account: ' + (res.error || 'Unknown error'));
    }
    await loadGlobalConfig();
  };
  
  const handleSelectAccount = async (id: string) => {
    const res = await window.electronAPI.selectAccount(id);
    if (!res.success) {
      alert('Failed to select account: ' + (res.error || 'Unknown error'));
    }
    await loadGlobalConfig();
  };
  
  const handleLogoutAll = async () => {
    const res = await window.electronAPI.logoutAccounts();
    if (!res.success) {
      alert('Failed to logout accounts: ' + (res.error || 'Unknown error'));
    }
    await loadGlobalConfig();
  };
  

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Application Settings</h1>
      
      <div className={`p-6 rounded-2xl mb-6 ${theme === 'fancy' ? "bg-white/5 border border-white/5" : "bg-[#c6c6c6] border-2 border-[#555555] text-black"}`}>
        <h2 className="text-xl font-bold mb-4">Theme</h2>
        <div className="flex gap-4">
          <button 
            onClick={() => setTheme('fancy')}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${theme === 'fancy' ? "border-aiom-accent bg-aiom-accent/10" : "border-transparent bg-black/20"}`}
          >
            <div className="font-bold mb-2">Fancy</div>
            <div className="text-sm opacity-70">Modern, rounded, beautiful UI</div>
          </button>
          
          <button 
            onClick={() => setTheme('default')}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${theme === 'default' ? "border-blue-500 bg-blue-500/10" : "border-transparent bg-black/20"}`}
          >
            <div className="font-bold mb-2">Default</div>
            <div className="text-sm opacity-70">Classic Minecraft vanilla style</div>
          </button>
        </div>
      </div>
      
      

      <div className={`p-6 rounded-2xl ${theme === 'fancy' ? "bg-white/5 border border-white/5" : "bg-[#c6c6c6] border-2 border-[#555555] text-black"}`}>
        <h2 className="text-xl font-bold mb-4">Minecraft Configuration</h2>
        <p className="opacity-70 mb-4">Set global defaults for new mod packs (options.txt)</p>
        <button 
          onClick={() => setShowConfigModal(true)}
          className={`w-full py-3 font-bold flex items-center justify-center gap-2 ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg rounded-xl" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
        >
          <SettingsIcon size={20} />
          Online Minecraft Config
        </button>
      </div>
      
      <div className={`p-6 rounded-2xl mt-6 ${theme === 'fancy' ? "bg-white/5 border border-white/5" : "bg-[#c6c6c6] border-2 border-[#555555] text-black"}`}>
        <h2 className="text-xl font-bold mb-4">Accounts</h2>
        <div className="flex gap-3 mb-4">
          <button 
            onClick={handleLoginMicrosoft}
            disabled={isBusy}
            className={`px-4 py-2 rounded-xl font-bold ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg disabled:opacity-50" : "bg-[#8b8b8b] text-white border-2 border-white disabled:opacity-50"}`}
          >
            Login Microsoft
          </button>
          <button 
            onClick={handleAddOffline}
            className={`px-4 py-2 rounded-xl font-bold ${theme === 'fancy' ? "bg-white/10 text-white" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
          >
            Add Offline Account
          </button>
          <button 
            onClick={handleLogoutAll}
            className={`px-4 py-2 rounded-xl font-bold ${theme === 'fancy' ? "bg-red-500 text-white" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
          >
            Logout All
          </button>
        </div>
        
        <div className="space-y-2">
          {(options.accounts || []).length === 0 ? (
            <div className="opacity-70 text-sm">No accounts configured.</div>
          ) : (
            (options.accounts || []).map((a: any) => (
              <div key={a.id} className={`p-3 rounded-lg flex items-center justify-between ${theme === 'fancy' ? "bg-white/10 text-white" : "bg-white border border-[#8b8b8b]"}`}>
                <div className="flex items-center gap-3">
                  <div className="font-bold">{a.name}</div>
                  <div className="text-xs opacity-70">{a.type}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleSelectAccount(a.id)}
                    className={`px-3 py-1 rounded ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg" : "bg-[#8b8b8b] text-white border border-white"}`}
                  >
                    Set Active
                  </button>
                  <button 
                    onClick={() => handleRemoveAccount(a.id)}
                    className={`px-3 py-1 rounded ${theme === 'fancy' ? "bg-red-500 text-white" : "bg-[#8b8b8b] text-white border border-white"}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      

      {showConfigModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`w-full max-w-2xl p-8 rounded-2xl max-h-[80vh] overflow-auto ${theme === 'fancy' ? "bg-[#1e1e2e] border border-white/10 text-white" : "bg-[#c6c6c6] border-4 border-white text-black"}`}>
            <h2 className="text-2xl font-bold mb-6">Global Minecraft Settings</h2>
            
            <div className="grid grid-cols-1 gap-4 mb-6">
              {Object.entries(options).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                  <span className="font-mono">{key}</span>
                  <input 
                    type="text" 
                    value={value as string} 
                    onChange={(e) => handleOptionChange(key, e.target.value)}
                    className={`p-2 rounded w-1/2 ${theme === 'fancy' ? "bg-black/30 border border-white/10 text-white" : "bg-white border border-gray-500 text-black"}`}
                  />
                </div>
              ))}
              
              <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-200 text-sm">
                Tip: Set <code>tutorialStep</code> to <code>none</code> to skip the "Welcome to Minecraft" tutorial.
                <br/>
                Set <code>narrator</code> to <code>0</code> to disable the narrator prompt.
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowConfigModal(false)}
                className={`px-4 py-2 ${theme === 'fancy' ? "text-white/70 hover:text-white" : "text-black underline"}`}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveConfig}
                className={`px-6 py-2 font-bold flex items-center gap-2 ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg rounded-xl" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
              >
                <Save size={18} />
                Save Globals
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
