import React, { useEffect, useState } from 'react';
import { Plus, Play, Folder, Import, FileText } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';

interface ModPack {
  name: string;
  loader?: string;
  version?: string;
  created?: string;
}

const ModPacks: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [packs, setPacks] = useState<ModPack[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Create Modal State
  const [newName, setNewName] = useState('');
  const [newLoader, setNewLoader] = useState('Vanilla');
  const [newVersion, setNewVersion] = useState('1.20.1');
  const [versions, setVersions] = useState<any[]>([]);
  const [kingVersions, setKingVersions] = useState<any[]>([]);

  const loaders = ['Vanilla', 'Forge', 'Fabric', 'Quilt', 'NeoForge'];

  useEffect(() => {
    try {
      (window.electronAPI as any)?.updateDiscordPresence?.('Browsing Library');
    } catch {}
    loadPacks();
    loadVersions();
  }, []);

  useEffect(() => {
    if (newLoader === 'KingModLoader') {
      loadKingVersions();
    }
  }, [newLoader]);

  const loadKingVersions = async () => {
    try {
      const v = await window.electronAPI.fetchKingVersions();
      if (v && v.length > 0) {
        setKingVersions(v);
        setNewVersion(v[0].id);
      }
    } catch (e) {
      console.error('Failed to load King versions', e);
    }
  };

  const loadVersions = async () => {
    try {
      const v = await window.electronAPI.getMinecraftVersions();
      if (v && v.length > 0) {
        setVersions(v);
        // Set default to latest release
        const latest = v.find((ver: any) => ver.type === 'release');
        if (latest) setNewVersion(latest.id);
      }
    } catch (e) {
      console.error('Failed to load versions', e);
    }
  };

  const loadPacks = async () => {
    const loadedPacks = await window.electronAPI.getModPacks();
    setPacks(loadedPacks);
  };

  const handleImport = async () => {
    setShowImportMenu(true);
  };
  const [showImportMenu, setShowImportMenu] = useState(false);
  const doImportFolder = async () => {
    const result = await window.electronAPI.importInstance();
    setShowImportMenu(false);
    if (result.success) {
      alert('Instance imported successfully!');
      loadPacks();
    } else if (result.error !== 'Cancelled') {
      alert('Import failed: ' + result.error);
    }
  };
  const doImportAIOMPack = async () => {
    const result = await window.electronAPI.importAIOMPack();
    setShowImportMenu(false);
    if (result.success) {
      alert('AIOM pack imported successfully!');
      loadPacks();
    } else if (result.error !== 'Cancelled') {
      alert('Import failed: ' + result.error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await window.electronAPI.createModPack(newName, newLoader, newVersion);
    if (result.success) {
      setShowCreateModal(false);
      setNewName('');
      loadPacks();
    } else {
      alert('Error creating mod pack: ' + result.error);
    }
  };

  const handlePlay = async (e: React.MouseEvent, packName: string) => {
    e.stopPropagation();
    const ok = await window.electronAPI.launchGame(packName);
    if (!ok) {
      alert(`Failed to launch ${packName}. Ensure Java is available and the pack version is valid.`);
    }
  };
  const handleAddContent = (e: React.MouseEvent, pack: ModPack) => {
    e.stopPropagation();
    localStorage.setItem('activeBrowseTab', 'mod');
    localStorage.setItem('targetModPack', pack.name);
    if (pack.version && pack.version !== 'unknown') {
      localStorage.setItem('browseVersion', String(pack.version));
    }
    if (pack.loader && pack.loader !== 'unknown') {
      localStorage.setItem('browseLoader', String(pack.loader).toLowerCase());
    }
    navigate('/browse');
  };

  const containerClass = theme === 'fancy' 
    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    : "flex flex-col gap-2";

  const cardClass = theme === 'fancy'
    ? "bg-white/5 hover:bg-white/10 p-6 rounded-2xl transition-all border border-white/5 hover:border-aiom-accent/50 cursor-pointer group relative overflow-hidden"
    : "bg-[#c6c6c6] border-2 border-[#555555] p-2 flex items-center justify-between text-black hover:bg-[#dcdcdc] cursor-pointer";

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Mod Packs</h1>
        <div className="flex gap-4">
          <button
            onClick={handleImport}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              theme === 'fancy' 
                ? "bg-white/10 text-white hover:bg-white/20 border border-white/5" 
                : "bg-[#8b8b8b] text-white border-2 border-white active:border-[#555555]"
            }`}
          >
            <Import size={20} />
            Import Instance
          </button>
          {showImportMenu && (
            <div className={`absolute right-0 top-full mt-2 z-20 w-64 rounded-xl overflow-hidden ${
              theme === 'fancy' ? "bg-[#1e1e2e] border border-white/10" : "bg-[#c6c6c6] border-2 border-white"
            }`}>
              <button onClick={doImportFolder} className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-2">
                <Folder size={16} /> Import from Folder
              </button>
              <button onClick={doImportAIOMPack} className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-2">
                <FileText size={16} /> Import from AIOM Pack (.aiompack)
              </button>
              <button onClick={() => setShowImportMenu(false)} className="w-full text-left px-4 py-3 hover:bg-white/10">
                Cancel
              </button>
            </div>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              theme === 'fancy' 
                ? "bg-aiom-accent text-aiom-bg hover:scale-105 shadow-lg shadow-aiom-accent/20" 
                : "bg-[#8b8b8b] text-white border-2 border-white active:border-[#555555]"
            }`}
          >
            <Plus size={20} />
            Create New Mod Pack
          </button>
        </div>
      </div>

      <div className={containerClass}>
        {packs.map((pack) => (
          <div 
            key={pack.name} 
            className={cardClass}
            onClick={() => navigate(`/modpack/${pack.name}`)}
          >
            {theme === 'fancy' ? (
              <>
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play 
                    className="text-aiom-accent fill-current hover:scale-110 transition-transform cursor-pointer" 
                    size={32} 
                    onClick={(e) => handlePlay(e, pack.name)}
                  />
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl mb-4 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                  {pack.name.substring(0, 1).toUpperCase()}
                </div>
                <h3 className="text-xl font-bold mb-1">{pack.name}</h3>
                <div className="text-sm text-gray-400 flex flex-col gap-1">
                  <span className="bg-white/10 w-fit px-2 py-0.5 rounded text-xs">{pack.loader || 'Unknown'}</span>
                  <span>{pack.version || 'Unknown Version'}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-[#8b8b8b] border-2 border-white flex items-center justify-center">
                     <Folder size={24} className="text-white" />
                   </div>
                   <div>
                     <h3 className="font-bold text-lg">{pack.name}</h3>
                     <p className="text-xs">{pack.loader} - {pack.version}</p>
                   </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    className="bg-[#4a4a4a] text-white px-4 py-2 border-2 border-[#2a2a2a] hover:bg-[#5a5a5a] active:bg-[#3a3a3a]"
                    onClick={(e) => handlePlay(e, pack.name)}
                  >
                    Play
                  </button>
                  <button 
                    className="bg-[#4a4a4a] text-white px-4 py-2 border-2 border-[#2a2a2a] hover:bg-[#5a5a5a] active:bg-[#3a3a3a]"
                    onClick={(e) => handleAddContent(e, pack)}
                  >
                    Add Content
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`${theme === 'fancy' ? "bg-[#1e1e2e] rounded-2xl border border-white/10" : "bg-[#c6c6c6] border-4 border-white outline outline-2 outline-black"} p-8 w-full max-w-md shadow-2xl`}>
            <h2 className={`text-2xl font-bold mb-6 ${theme === 'fancy' ? 'text-white' : 'text-black'}`}>Create New Mod Pack</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Name</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  className={`w-full p-3 ${theme === 'fancy' ? "bg-black/20 rounded-xl border border-white/5 focus:border-aiom-accent outline-none text-white" : "bg-white border-2 border-[#8b8b8b] text-black"}`}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Mod Loader</label>
                <select 
                  value={newLoader} 
                  onChange={(e) => setNewLoader(e.target.value)}
                  className={`w-full p-3 ${theme === 'fancy' ? "bg-black/20 rounded-xl border border-white/5 focus:border-aiom-accent outline-none text-white" : "bg-white border-2 border-[#8b8b8b] text-black"}`}
                >
                  {loaders.map(l => <option key={l} value={l} className="text-black">{l}</option>)}
                </select>
                {newLoader === 'KingModLoader' && (
                  <div className="mt-2 p-3 bg-yellow-500/20 text-yellow-200 rounded-lg text-sm border border-yellow-500/30">
                    ⚠️ You will require WiFi for this mod loader.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Minecraft Version</label>
                {newLoader === 'KingModLoader' ? (
                  <select
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className={`w-full p-3 ${theme === 'fancy' ? "bg-black/20 rounded-xl border border-white/5 focus:border-aiom-accent outline-none text-white" : "bg-white border-2 border-[#8b8b8b] text-black"}`}
                  >
                    {kingVersions.map(v => (
                      <option key={v.id} value={v.id} className="text-black">{v.name}</option>
                    ))}
                  </select>
                ) : versions.length > 0 ? (
                  <select
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className={`w-full p-3 ${theme === 'fancy' ? "bg-black/20 rounded-xl border border-white/5 focus:border-aiom-accent outline-none text-white" : "bg-white border-2 border-[#8b8b8b] text-black"}`}
                  >
                    {versions.filter(v => v.type === 'release').map(v => (
                      <option key={v.id} value={v.id} className="text-black">{v.id} (Release)</option>
                    ))}
                    <option disabled>--- Snapshots ---</option>
                    {versions.filter(v => v.type === 'snapshot').slice(0, 20).map(v => (
                      <option key={v.id} value={v.id} className="text-black">{v.id} (Snapshot)</option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    value={newVersion} 
                    onChange={(e) => setNewVersion(e.target.value)}
                    className={`w-full p-3 ${theme === 'fancy' ? "bg-black/20 rounded-xl border border-white/5 focus:border-aiom-accent outline-none text-white" : "bg-white border-2 border-[#8b8b8b] text-black"}`}
                    placeholder="e.g. 1.21.8 or 26.3"
                  />
                )}
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className={`px-4 py-2 ${theme === 'fancy' ? "text-white/70 hover:text-white" : "text-black underline"}`}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className={`px-6 py-2 font-bold ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg rounded-xl" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModPacks;
