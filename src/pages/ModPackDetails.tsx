import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { ArrowLeft, FileText, Globe, Play, MoreVertical, FolderOpen, Share2, Check, Plus, Trash2, Box } from 'lucide-react';
import { Link } from 'react-router-dom';

const ModPackDetails: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  
  // Tabs
  const [mainTab, setMainTab] = useState<'logs' | 'worlds' | 'content'>('content');
  const [worldTab, setWorldTab] = useState<'singleplayer' | 'multiplayer'>('singleplayer');
  const [launchStatus, setLaunchStatus] = useState<any>(null);
  const [launchLogs, setLaunchLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement | null>(null);

  // Menu State
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [packFiles, setPackFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  
  // KingModLoader State
  const [packInfo, setPackInfo] = useState<any>(null);
  const [installedMods, setInstalledMods] = useState<{ name: string; size: number }[]>([]);

  useEffect(() => {
    if (name) {
      window.electronAPI.updateDiscordPresence(`Managing ${name}`);
      loadPackInfo();
      loadFiles();
      loadInstalledMods();
    }
  }, [name]);
  
  useEffect(() => {
    window.electronAPI.onLaunchStatus((s) => {
      setLaunchStatus(s);
      if (s.message) {
        setLaunchLogs((prev) => [...prev.slice(-500), s.message]);
      }
    });
    window.electronAPI.onPackUpdated((info) => {
      if (info?.packName === name) {
        loadInstalledMods();
      }
    });
  }, []);
  
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [launchLogs, launchStatus]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      loadFiles();
      loadInstalledMods();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [name]);

  const loadPackInfo = async () => {
    const packs = await window.electronAPI.getModPacks();
    const p = packs.find((p: any) => p.name === name);
    setPackInfo(p);
  };

  const loadFiles = async () => {
    const files = await window.electronAPI.getPackFiles(name || '');
    setPackFiles(files);
  };
  const loadInstalledMods = async () => {
    if (!name) return;
    const mods = await window.electronAPI.getInstalledMods(name);
    setInstalledMods(mods);
  };

  // Actions
  const handleAddContent = () => {
    localStorage.setItem('activeBrowseTab', 'mod');
    localStorage.setItem('targetModPack', name || '');
    if (packInfo?.version && packInfo.version !== 'unknown') {
      localStorage.setItem('browseVersion', packInfo.version);
    }
    if (packInfo?.loader && packInfo.loader !== 'unknown') {
      localStorage.setItem('browseLoader', String(packInfo.loader).toLowerCase());
    }
    navigate('/browse');
  };

  const handlePlay = async (worldName?: string, serverIp?: string) => {
    if (!name) return;
    if (launchStatus?.state === 'running' || launchStatus?.state === 'starting') {
      // allow starting another instance? for now just launch again in background
    }
    setMainTab('logs');
    setLaunchLogs((prev) => [...prev, 'Starting launch...']);
    const ok = await window.electronAPI.launchGame(name, worldName, serverIp);
    if (!ok) {
      alert('Failed to launch Minecraft. Ensure Java is available and the pack version is valid.');
    }
  };
  
  useEffect(() => {
    loadInstalledMods();
  }, [name, mainTab]);

  const handleOpenFolder = async () => {
    if (!name) return;
    await window.electronAPI.openPackFolder(name);
    setShowMenu(false);
  };
  const handleUpdateFromGitHub = async () => {
    if (!name) return;
    setMainTab('logs');
    setLaunchLogs((prev) => [...prev, 'Starting Astro update...']);
    window.electronAPI.onUpdateProgress((p) => {
      if (p?.packName === name) {
        setLaunchLogs((prev) => [...prev.slice(-500), `Update ${Math.round(p.percent * 100)}%: ${p.file || ''}`]);
      }
    });
    const res = await window.electronAPI.updateFromAstro(name);
    if (!res.success) {
      setLaunchLogs((prev) => [...prev.slice(-500), `Update failed: ${res.error}`]);
      alert('Update failed: ' + res.error);
    } else {
      setLaunchLogs((prev) => [...prev.slice(-500), 'Update complete.']);
    }
    setShowMenu(false);
  };

  const handleShareClick = async () => {
    if (!name) return;
    const files = await window.electronAPI.getPackFiles(name);
    setPackFiles(files);
    setSelectedFiles(new Set(files)); // Select all by default
    setShowShareModal(true);
    setShowMenu(false);
  };

  const handleExport = async () => {
    if (!name) return;
    const result = await window.electronAPI.exportPack(name, Array.from(selectedFiles));
    if (result.success) {
      alert(`Pack exported successfully to ${result.path}`);
      setShowShareModal(false);
    } else {
      if (result.error !== 'Cancelled') {
        alert('Export failed: ' + result.error);
      }
    }
  };

  const handleDelete = async () => {
    if (!name) return;
    const result = await window.electronAPI.deleteModPack(name);
    if (result.success) {
      navigate('/');
    } else {
      alert('Failed to delete pack: ' + result.error);
    }
    setShowDeleteModal(false);
  };

  const toggleFile = (file: string) => {
    const newSet = new Set(selectedFiles);
    if (newSet.has(file)) newSet.delete(file);
    else newSet.add(file);
    setSelectedFiles(newSet);
  };

  return (
    <div className="h-full flex flex-col relative" onClick={() => setShowMenu(false)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/" className={`p-2 rounded-full ${theme === 'fancy' ? "hover:bg-white/10" : "bg-[#8b8b8b] text-white"}`}>
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{name}</h1>
            <p className="opacity-60">Manage your mod pack</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => handlePlay()}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              theme === 'fancy' 
                ? "bg-green-500 text-white hover:scale-105 shadow-lg shadow-green-500/20" 
                : "bg-green-600 text-white border-2 border-white active:border-[#555555]"
            }`}
          >
            <Play size={20} fill="currentColor" />
            {(launchStatus?.state === 'starting' || launchStatus?.state === 'debug') ? 'Launching...' : (launchStatus?.state === 'running') ? 'Running' : 'Play'}
          </button>
          <button 
            onClick={handleAddContent}
            disabled={String(packInfo?.loader || '').toLowerCase() === 'vanilla'}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              theme === 'fancy' 
                ? "bg-white/10 text-white hover:bg-white/20 disabled:opacity-50" 
                : "bg-[#8b8b8b] text-white border-2 border-white active:border-[#555555] disabled:opacity-50"
            }`}
          >
            <Plus size={20} />
            Add Content
          </button>
          
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => {
                const willOpen = !showMenu;
                setShowMenu(willOpen);
                if (willOpen) {
                  loadFiles();
                  loadInstalledMods();
                }
              }}
              className={`p-3 rounded-xl ${theme === 'fancy' ? "hover:bg-white/10" : "bg-[#8b8b8b] text-white"}`}
            >
              <MoreVertical size={20} />
            </button>
            
            {showMenu && (
              <div className={`absolute right-0 top-full mt-2 w-48 z-10 rounded-xl overflow-hidden shadow-2xl ${
                theme === 'fancy' ? "bg-[#1e1e2e] border border-white/10" : "bg-[#c6c6c6] border-2 border-white"
              }`}>
                <button 
                  onClick={handleOpenFolder}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-2"
                >
                  <FolderOpen size={16} /> Open Folder
                </button>
                <button 
                  onClick={handleShareClick}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-2"
                >
                  <Share2 size={16} /> Share / Export
                </button>
                <button 
                  onClick={handleUpdateFromGitHub}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-2"
                >
                  <Globe size={16} /> Update from GitHub (All Folders)
                </button>
                <button 
                  onClick={() => { setShowDeleteModal(true); setShowMenu(false); }}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-2 text-red-400 hover:text-red-300"
                >
                  <Trash2 size={16} /> Remove Mod Pack
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        {[
          { id: 'logs', label: 'Logs', icon: FileText },
          { id: 'worlds', label: 'Worlds & Servers', icon: Globe },
          { id: 'content', label: 'Content', icon: Box },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setMainTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-all ${
              mainTab === tab.id 
                ? (theme === 'fancy' ? "border-aiom-accent text-aiom-accent" : "bg-[#8b8b8b] text-white border-black") 
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub Tabs Area */}
      <div className="flex-1 overflow-auto">
        {mainTab === 'worlds' && (
           <div>
             <div className="flex gap-2 mb-4">
               {['Singleplayer', 'Multiplayer'].map(item => {
                 const id = item.toLowerCase() as any;
                 return (
                   <button
                     key={id}
                     onClick={() => setWorldTab(id)}
                     className={`px-4 py-2 rounded-lg ${
                       worldTab === id 
                         ? (theme === 'fancy' ? "bg-white/10 text-white" : "bg-[#555555] text-white") 
                         : "opacity-60 hover:opacity-100"
                     }`}
                   >
                     {item}
                   </button>
                 );
               })}
             </div>
             
             {/* Mock List for demonstration */}
             <div className="space-y-2">
               {worldTab === 'singleplayer' ? (
                 <div className={`p-4 rounded-xl flex items-center justify-between ${theme === 'fancy' ? "bg-white/5" : "bg-[#c6c6c6] border border-gray-500"}`}>
                   <div>
                     <div className="font-bold">New World</div>
                     <div className="text-sm opacity-60">Survival Mode, Cheats Off</div>
                   </div>
                   <button 
                    onClick={() => handlePlay('New World')}
                    className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                   >
                     <Play size={20} fill="currentColor" />
                   </button>
                 </div>
               ) : (
                 <div className={`p-4 rounded-xl flex items-center justify-between ${theme === 'fancy' ? "bg-white/5" : "bg-[#c6c6c6] border border-gray-500"}`}>
                   <div>
                     <div className="font-bold">Hypixel</div>
                     <div className="text-sm opacity-60">mc.hypixel.net</div>
                   </div>
                   <button 
                    onClick={() => handlePlay(undefined, 'mc.hypixel.net')}
                    className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                   >
                     <Play size={20} fill="currentColor" />
                   </button>
                 </div>
               )}
             </div>
           </div>
        )}

        {mainTab === 'logs' && (
          <div ref={logsRef} className="font-mono text-sm p-4 bg-black/30 rounded-xl h-full overflow-auto">
            <div className="mb-2">
              {launchStatus?.state === 'starting' && <div className="opacity-80">Starting...</div>}
              {launchStatus?.state === 'running' && <div className="opacity-80">Running {launchStatus?.version}</div>}
              {launchStatus?.state === 'failed' && <div className="text-red-400">Failed: {launchStatus?.error}</div>}
              {launchStatus?.state === 'closed' && <div className="opacity-80">Game closed</div>}
            </div>
            {launchLogs.length === 0 ? (
              <div className="opacity-70">No logs yet.</div>
            ) : (
              <pre className="whitespace-pre-wrap opacity-80">
                {launchLogs.join('\n')}
              </pre>
            )}
          </div>
        )}
        {mainTab === 'content' && (
          <div className={`p-6 rounded-xl ${theme === 'fancy' ? "bg-white/5 border border-white/10" : "bg-[#c6c6c6] border-2 border-[#8b8b8b] text-black"}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Manage Content</h2>
                <p className="opacity-70 text-sm">Browse and add mods, resource packs, and shaders.</p>
              </div>
              <button 
                onClick={handleAddContent}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold ${
                  theme === 'fancy' 
                    ? "bg-aiom-accent text-aiom-bg" 
                    : "bg-[#8b8b8b] text-white border-2 border-white"
                }`}
              >
                <Plus size={18} />
                Browse Content
              </button>
            </div>
            <div className="mb-4">
              {String(packInfo?.loader || '').toLowerCase() === 'vanilla' && (
                <div className={`p-3 rounded-lg mb-4 ${theme === 'fancy' ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-200" : "bg-yellow-200 border-2 border-yellow-400 text-black"}`}>
                  Content installation is disabled for Vanilla packs.
                </div>
              )}
              <h3 className="font-bold mb-2">Installed Mods</h3>
              {installedMods.length === 0 ? (
                <div className={`${theme === 'fancy' ? "text-white/70" : "text-black/70"} text-sm`}>
                  No mods installed. Use Browse Content to add mods.
                </div>
              ) : (
                <div className="space-y-2">
                  {installedMods.map(m => (
                    <div key={m.name} className={`p-3 rounded-lg flex items-center justify-between ${theme === 'fancy' ? "bg-white/10" : "bg-white border border-[#8b8b8b]"}`}>
                      <span className="font-mono text-sm">{m.name}</span>
                      <span className="opacity-60 text-xs">{(m.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>



      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`w-full max-w-lg p-8 rounded-2xl max-h-[80vh] flex flex-col ${theme === 'fancy' ? "bg-[#1e1e2e] border border-white/10 text-white" : "bg-[#c6c6c6] border-4 border-white text-black"}`}>
            <h2 className="text-2xl font-bold mb-2">Export Mod Pack</h2>
            <p className="opacity-70 mb-4">Select files to include in the <code>.aiompack</code> file.</p>
            
            <div className="flex-1 overflow-auto bg-black/20 p-4 rounded-xl mb-6">
              {packFiles.map(file => (
                <div key={file} onClick={() => toggleFile(file)} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                    selectedFiles.has(file) ? "bg-aiom-accent border-aiom-accent" : "border-gray-500"
                  }`}>
                    {selectedFiles.has(file) && <Check size={14} className="text-black" />}
                  </div>
                  <span className="truncate text-sm font-mono">{file}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowShareModal(false)}
                className={`px-4 py-2 ${theme === 'fancy' ? "text-white/70 hover:text-white" : "text-black underline"}`}
              >
                Cancel
              </button>
              <button 
                onClick={handleExport}
                className={`px-6 py-2 font-bold flex items-center gap-2 ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg rounded-xl" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
              >
                <Share2 size={18} />
                Export Pack
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`w-full max-w-md p-8 rounded-2xl ${theme === 'fancy' ? "bg-[#1e1e2e] border border-white/10 text-white" : "bg-[#c6c6c6] border-4 border-white text-black"}`}>
            <h2 className="text-2xl font-bold mb-4">Delete Mod Pack?</h2>
            <p className="opacity-70 mb-6">
              Are you sure you want to delete <strong>{name}</strong>? This action cannot be undone and will permanently remove all files, worlds, and configs associated with this pack.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowDeleteModal(false)}
                className={`px-4 py-2 ${theme === 'fancy' ? "text-white/70 hover:text-white" : "text-black underline"}`}
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                className="px-6 py-2 font-bold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModPackDetails;
