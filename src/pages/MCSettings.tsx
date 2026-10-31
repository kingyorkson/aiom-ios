import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Trash2, User, Check, Plus, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';

interface Account {
  id: string;
  type: 'microsoft' | 'offline';
  name: string;
  uuid?: string;
}

const MCSettings: React.FC = () => {
  const { theme } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newOfflineName, setNewOfflineName] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [skins, setSkins] = useState<Array<{ name: string; path: string; size: number }>>([]);
  const [showSkins, setShowSkins] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [minecraftVerified, setMinecraftVerified] = useState(false);
  const [minecraftVerifiedAccount, setMinecraftVerifiedAccount] = useState<any>(null);

  const loadConfig = async () => {
    const config = await window.electronAPI.getGlobalConfig();
    if (config.accounts) setAccounts(config.accounts);
    if (config.selectedAccountId) setSelectedAccountId(config.selectedAccountId);
    
    // Load verification status
    try {
      if ((window.electronAPI as any).getMinecraftVerification) {
        const v = await (window.electronAPI as any).getMinecraftVerification();
        setMinecraftVerified(!!v?.verified);
        setMinecraftVerifiedAccount(v?.account || null);
      }
    } catch {}
    
    // Migration for legacy single offline name if no accounts exist
    if ((!config.accounts || config.accounts.length === 0) && config.offlineName) {
         // Auto-add legacy offline name as account
         await window.electronAPI.addOfflineAccount(config.offlineName);
         // Reload
         const newConfig = await window.electronAPI.getGlobalConfig();
         if (newConfig.accounts) setAccounts(newConfig.accounts);
         if (newConfig.selectedAccountId) setSelectedAccountId(newConfig.selectedAccountId);
    }
  };
    
    // Migration for legacy single offline name if no accounts exist
    if ((!config.accounts || config.accounts.length === 0) && config.offlineName) {
         // Auto-add legacy offline name as account
         await window.electronAPI.addOfflineAccount(config.offlineName);
         // Reload
         const newConfig = await window.electronAPI.getGlobalConfig();
         if (newConfig.accounts) setAccounts(newConfig.accounts);
         if (newConfig.selectedAccountId) setSelectedAccountId(newConfig.selectedAccountId);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleMicrosoftLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await window.electronAPI.loginMicrosoft();
      if (result.success) {
        await loadConfig();
      } else {
        alert('Login failed: ' + result.error);
      }
    } catch (e) {
      alert('Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAddOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfflineName.trim()) return;
    const result = await window.electronAPI.addOfflineAccount(newOfflineName);
    if (result.success) {
      setNewOfflineName('');
      await loadConfig();
    } else {
      alert('Failed to add account: ' + result.error);
    }
  };

  const handleSelectAccount = async (id: string) => {
    await window.electronAPI.selectAccount(id);
    setSelectedAccountId(id);
  };

  const handleRemoveAccount = async (id: string) => {
    if (confirm('Are you sure you want to remove this account?')) {
      await window.electronAPI.removeAccount(id);
      await loadConfig();
    }
  };

  const handleVerifyMinecraft = async () => {
    setIsVerifying(true);
    try {
      if ((window.electronAPI as any).verifyMinecraft) {
        const result = await (window.electronAPI as any).verifyMinecraft();
        if (result.success && result.ownsMinecraft) {
          await loadConfig();
          alert('Minecraft ownership verified successfully!');
        } else {
          alert(result.error || 'Failed to verify Minecraft ownership');
        }
      }
    } catch (e: any) {
      alert('Verification failed: ' + e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Skins library only (no URL or direct local assignment)
  
  const refreshSkins = async () => {
    const list = await window.electronAPI.listSkins();
    setSkins(list || []);
  };
  const handleUploadSkinToLibrary = async () => {
    const file = await window.electronAPI.selectSkinFile();
    if (!file) return;
    const res = await window.electronAPI.saveSkin(file);
    if (!res.success) {
      alert('Failed to save skin: ' + (res.error || 'Unknown error'));
      return;
    }
    await refreshSkins();
    alert('Skin added: ' + (res.name || ''));
  };
  const handleAssignSkinFromLibrary = async (path: string) => {
    if (!selectedAccountId) {
      alert('Please select an account first');
      return;
    }
    const res = await window.electronAPI.assignAccountSkin(selectedAccountId, path);
    if (!res.success) {
      alert('Failed to assign skin: ' + (res.error || 'Unknown error'));
      return;
    }
    alert('Skin assigned to account');
    await loadConfig();
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Account Management</h1>
      </div>

      {/* Minecraft Verification */}
      <div className={`mb-8 p-6 rounded-2xl ${theme === 'fancy' ? 'bg-black/20 border border-white/5' : 'bg-white border-2 border-[#8b8b8b]'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            {minecraftVerified ? <ShieldCheck className="text-green-500" size={24} /> : <AlertCircle className="text-yellow-500" size={24} />}
            Minecraft Verification
          </h2>
          {!minecraftVerified && <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded">Required to play</span>}
        </div>
        
        {minecraftVerified ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
            <ShieldCheck className="text-green-500" size={32} />
            <div>
              <div className="font-bold text-green-500">Verified</div>
              <div className="text-sm opacity-70">Account: {minecraftVerifiedAccount?.name} ({minecraftVerifiedAccount?.uuid?.substring(0, 8)}...)</div>
            </div>
          </div>
        ) : (
          <div>
            <p className="opacity-80 mb-4">
              You must verify your Minecraft account ownership to launch the game. This account will not be automatically added to your offline/online account lists.
            </p>
            <button
              onClick={handleVerifyMinecraft}
              disabled={isVerifying}
              className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${
                isVerifying ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'
              } ${theme === 'fancy' ? 'bg-aiom-accent text-aiom-bg' : 'bg-[#8b8b8b] text-white border-2 border-white'}`}
            >
              {isVerifying ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
              {isVerifying ? 'Verifying...' : 'Verify to play Minecraft'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Account List */}
        <div className={`p-6 rounded-2xl ${theme === 'fancy' ? 'bg-black/20 border border-white/5' : 'bg-white border-2 border-[#8b8b8b]'}`}>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <User size={20} />
            Your Accounts
          </h2>
          
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {accounts.length === 0 ? (
              <p className="opacity-50 text-center py-8">No accounts added yet.</p>
            ) : (
              accounts.map((account) => (
                <div 
                  key={account.id}
                  onClick={() => handleSelectAccount(account.id)}
                  className={`p-4 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                    selectedAccountId === account.id 
                      ? 'bg-aiom-accent text-white shadow-lg transform scale-[1.02]' 
                      : theme === 'fancy' 
                        ? 'bg-white/5 hover:bg-white/10' 
                        : 'bg-gray-100 hover:bg-gray-200 text-black'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedAccountId === account.id ? 'bg-white/20' : 'bg-gray-500/20'}`}>
                      {account.type === 'microsoft' ? (
                        <img src="https://img.icons8.com/color/48/microsoft.png" alt="MS" className="w-6 h-6" />
                      ) : (
                        <User size={20} />
                      )}
                    </div>
                    <div>
                      <div className="font-bold">{account.name}</div>
                      <div className="text-xs opacity-70 uppercase tracking-wider">{account.type}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {selectedAccountId === account.id && <Check size={20} />}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRemoveAccount(account.id); }}
                      className="p-2 hover:bg-red-500/20 hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add Account */}
        <div className="space-y-6">
          {/* Microsoft Login */}
          <div className={`p-6 rounded-2xl ${theme === 'fancy' ? 'bg-black/20 border border-white/5' : 'bg-white border-2 border-[#8b8b8b]'}`}>
            <h2 className="text-xl font-bold mb-4">Add Microsoft Account</h2>
            <button
              onClick={handleMicrosoftLogin}
              disabled={isLoggingIn}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all ${
                isLoggingIn ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'
              } ${theme === 'fancy' ? 'bg-[#00a4ef] hover:bg-[#0078d7] text-white' : 'bg-[#00a4ef] text-white'}`}
            >
              {isLoggingIn ? <Loader2 className="animate-spin" /> : <img src="https://img.icons8.com/color/48/microsoft.png" className="w-6 h-6 bg-white rounded-sm p-0.5" />}
              {isLoggingIn ? 'Logging in...' : 'Sign in with Microsoft'}
            </button>
            <p className="text-xs opacity-50 mt-3 text-center">
              Securely login via official Microsoft servers. We only store your access token locally.
            </p>
          </div>

          {/* Offline Account */}
          <div className={`p-6 rounded-2xl ${theme === 'fancy' ? 'bg-black/20 border border-white/5' : 'bg-white border-2 border-[#8b8b8b]'}`}>
            <h2 className="text-xl font-bold mb-4">Add Offline Account</h2>
            <form onSubmit={handleAddOffline} className="flex gap-2">
              <input
                type="text"
                value={newOfflineName}
                onChange={(e) => setNewOfflineName(e.target.value)}
                placeholder="Enter Username"
                className={`flex-1 p-3 rounded-xl outline-none ${
                  theme === 'fancy' 
                    ? 'bg-black/20 border border-white/5 focus:border-aiom-accent text-white' 
                    : 'bg-white border-2 border-[#8b8b8b] text-black'
                }`}
              />
              <button
                type="submit"
                disabled={!newOfflineName.trim()}
                className={`p-3 rounded-xl font-bold transition-all ${
                  !newOfflineName.trim() 
                    ? 'opacity-50 cursor-not-allowed bg-gray-500' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                <Plus size={24} />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Skins Library & Current Skin */}
      <div className={`mt-8 p-6 rounded-2xl ${theme === 'fancy' ? 'bg-black/20 border border-white/5' : 'bg-white border-2 border-[#8b8b8b]'}`}>
        <h2 className="text-xl font-bold mb-6">Skins Library</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex gap-2">
              <button 
                onClick={async () => { setShowSkins(true); await refreshSkins(); }}
                className={`flex-1 p-3 rounded-xl font-bold ${theme === 'fancy' ? "bg-white/10 text-white" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
              >
                Open Library
              </button>
              <button 
                onClick={handleUploadSkinToLibrary}
                className={`p-3 rounded-xl font-bold ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
              >
                Add To Library
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className={`w-48 h-64 rounded-xl flex items-center justify-center overflow-hidden relative ${theme === 'fancy' ? "bg-black/40" : "bg-gray-200"}`}>
              {(() => {
                const acc = accounts.find(a => a.id === selectedAccountId);
                const preview = acc && (acc as any).skinPath ? `file://${(acc as any).skinPath}` : null;
                return preview ? (
                  <img 
                    src={preview} 
                    alt="Current Skin" 
                    className="w-full h-full object-contain rendering-pixelated"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <div className="text-center opacity-50">
                    <User size={48} className="mx-auto mb-2" />
                    <p>No Skin Selected</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

      {showSkins && (
        <div className={`mt-6 p-4 rounded-xl ${theme === 'fancy' ? "bg-white/10 text-white" : "bg-white border border-[#8b8b8b]"}`}>
          {skins.length === 0 ? (
            <div className="opacity-70 text-sm">No skins yet. Upload a PNG to add one.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {skins.map(s => (
                <div key={s.path} className="flex items-center justify-between p-3 rounded-lg bg-black/10">
                  <div className="flex items-center gap-3">
                    <div className="font-bold">{s.name}</div>
                    <div className="text-xs opacity-70">{(s.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button 
                    onClick={() => handleAssignSkinFromLibrary(s.path)}
                    className={`px-3 py-1 rounded ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg" : "bg-[#8b8b8b] text-white border border-white"}`}
                  >
                    Change To (Selected Account)
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );

export default MCSettings;
