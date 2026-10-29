import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { Search, Download, Package, Box, Layers, Zap, Loader } from 'lucide-react';

const Browse: React.FC = () => {
  const { theme } = useTheme();
  const location = useLocation();
  
  // Search State
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('mod'); // mod, modpack, resourcepack, shader
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Filters
  const [filterVersion, setFilterVersion] = useState('');
  const [filterLoader, setFilterLoader] = useState('');
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  
  // Install State
  const [availablePacks, setAvailablePacks] = useState<any[]>([]);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [targetPack, setTargetPack] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);

  // URL Install State
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [installProgress, setInstallProgress] = useState<{ percent: number, status: string } | null>(null);

  useEffect(() => {
    window.electronAPI.updateDiscordPresence('Browsing Mods');
    loadPacks();
    loadVersions();

    // Check for navigation from ModPackDetails
    const storedTab = localStorage.getItem('activeBrowseTab');

    if (storedTab) {
      setActiveTab(storedTab);
      localStorage.removeItem('activeBrowseTab'); // Consume it
    }

    const storedTarget = localStorage.getItem('targetModPack');
    if (storedTarget) {
      setTargetPack(storedTarget);
      localStorage.removeItem('targetModPack'); // Consume it
    }
    const storedVersion = localStorage.getItem('browseVersion');
    if (storedVersion) {
      setFilterVersion(storedVersion);
      localStorage.removeItem('browseVersion');
    }
    const storedLoader = localStorage.getItem('browseLoader');
    if (storedLoader) {
      setFilterLoader(storedLoader);
      localStorage.removeItem('browseLoader');
    }

    // Listen for progress
    window.electronAPI.onDownloadProgress((progress) => {
      setInstallProgress(progress);
    });
    
    handleSearch();
  }, []);
  
  useEffect(() => {
    loadPacks();
    loadVersions();
    handleSearch();
  }, [location.key]);
  
  useEffect(() => {
    const onFocus = () => handleSearch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  
  useEffect(() => {
    // Periodic refresh removed; refresh happens on page open and focus
  }, []);

  useEffect(() => {
    const refreshVersions = async () => {
      try {
        if (filterLoader === 'kingmodloader') {
          const v = await window.electronAPI.fetchKingVersions();
          if (v && v.length > 0) {
            setAvailableVersions(v.map((ver: any) => ver.id));
            if (!filterVersion) {
              setFilterVersion(v[0].id);
            }
          } else {
            setAvailableVersions([]);
          }
        } else {
          const v = await window.electronAPI.getMinecraftVersions();
          if (v && v.length > 0) {
            setAvailableVersions(v.map((ver: any) => ver.id));
          } else {
            setAvailableVersions([]);
          }
        }
      } catch (e) {
        console.error('Failed to load versions', e);
        setAvailableVersions([]);
      }
    };
    refreshVersions();
  }, [filterLoader]);
  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch();
    }, 500);
    return () => clearTimeout(timer);
  }, [query, activeTab, filterVersion, filterLoader]);

  const loadVersions = async () => {
    try {
      if (filterLoader === 'kingmodloader') {
        const v = await window.electronAPI.fetchKingVersions();
        if (v && v.length > 0) {
          setAvailableVersions(v.map((ver: any) => ver.id));
          if (!filterVersion) {
            setFilterVersion(v[0].id);
          }
        } else {
          setAvailableVersions([]);
        }
      } else {
        const v = await window.electronAPI.getMinecraftVersions();
        if (v && v.length > 0) {
          setAvailableVersions(v.map((ver: any) => ver.id));
        } else {
          setAvailableVersions([]);
        }
      }
    } catch (e) {
      console.error('Failed to load versions', e);
      setAvailableVersions([]);
    }
  };

  const loadPacks = async () => {
    const packs = await window.electronAPI.getModPacks();
    setAvailablePacks(packs);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    try {
      if (activeTab === 'mod' && filterLoader === 'kingmodloader') {
        let v = filterVersion;
        if (!v) {
          try {
            const versions = await window.electronAPI.fetchKingVersions();
            if (versions && versions.length > 0) {
              v = versions[0].id;
              setFilterVersion(v);
            }
          } catch {}
        }
        const mods = await window.electronAPI.fetchKingMods(v || '');
        const mapped = mods.map((m: any) => ({
          project_id: m.id,
          title: m.name,
          author: m.author,
          description: m.description,
          icon_url: m.icon_url,
          downloads: 0,
          isKing: true,
          url: m.url,
          project_type: 'mod'
        }));
        setResults(mapped);
      } else {
        const hits = await window.electronAPI.searchModrinth(query || '', activeTab, filterVersion || undefined, filterLoader || undefined);
        setResults(hits);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAnalyzeUrl = async () => {
    if (!url) return;
    setIsAnalyzing(true);
    try {
      const result = await window.electronAPI.analyzeUrl(url);
      if (result) {
        setSelectedProject({ 
          project_id: 'url', 
          title: result.name, 
          project_type: result.type, 
          isUrl: true, 
          url 
        });
        // Pre-select pack if it's a modpack (empty target)
        if (result.type === 'modpack') {
           setTargetPack(''); // Modpacks don't need a target pack, they create one
        }
        setShowInstallModal(true);
      } else {
        alert('Could not detect a supported Minecraft resource from this URL.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      let res;
      if (selectedProject.isUrl) {
         res = await window.electronAPI.installFromUrl(selectedProject.url, targetPack);
      } else if (selectedProject.isKing) {
         res = await window.electronAPI.installKingMod(targetPack, selectedProject.url, selectedProject.title);
      } else {
         // Modrinth Project
         res = await window.electronAPI.installProject(selectedProject, targetPack);
      }

      if (res.success) {
        alert('Installation successful!');
        setShowInstallModal(false);
        setTargetPack('');
        loadPacks(); // Refresh packs in case a new one was created
      } else {
        alert('Installation failed: ' + res.error);
      }
    } catch (e) {
      alert('Installation failed due to an error.');
      console.error(e);
    } finally {
      setIsInstalling(false);
    }
  };

  const tabs = [
    { id: 'mod', label: 'Mods', icon: Box },
    { id: 'modpack', label: 'Mod Packs', icon: Package },
    { id: 'resourcepack', label: 'Resource Packs', icon: Layers },
    { id: 'shader', label: 'Shaders', icon: Zap },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 pb-24">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Browse & Install</h1>
          <p className="opacity-70">Search Modrinth, CurseForge, or paste a GitHub URL.</p>
        </div>
      </div>

      {/* URL Paster */}
      <div className={`mb-8 p-6 rounded-2xl shadow-lg ${theme === 'fancy' ? "bg-white/5 border border-white/10" : "bg-[#c6c6c6] border-4 border-white text-black"}`}>
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${theme === 'fancy' ? "text-white/50" : "text-black/50"}`} />
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste GitHub / Modrinth / CurseForge URL..."
              className={`w-full pl-12 pr-4 py-3 rounded-xl outline-none ${
                theme === 'fancy' 
                  ? "bg-black/20 border border-white/10 focus:border-aiom-accent text-white placeholder-white/30" 
                  : "bg-white border-2 border-[#8b8b8b] text-black placeholder-black/30"
              }`}
            />
          </div>
          <button 
            onClick={handleAnalyzeUrl}
            disabled={isAnalyzing || !url}
            className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 ${
              theme === 'fancy' 
                ? "bg-aiom-accent text-aiom-bg disabled:opacity-50" 
                : "bg-[#8b8b8b] text-white border-2 border-white disabled:opacity-50"
            }`}
          >
            {isAnalyzing ? <Loader className="animate-spin" /> : <Download />}
            Import
          </button>
        </div>
      </div>

      {/* Search Interface */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar / Tabs */}
        <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setResults([]); }}
              className={`p-4 rounded-xl flex items-center gap-3 font-bold transition-all text-left ${
                activeTab === tab.id
                  ? (theme === 'fancy' ? "bg-aiom-accent text-aiom-bg" : "bg-[#00a4ef] text-white border-2 border-white")
                  : (theme === 'fancy' ? "bg-white/5 hover:bg-white/10 text-white" : "bg-[#c6c6c6] text-black border-2 border-[#8b8b8b]")
              }`}
            >
              <tab.icon size={20} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {/* Search Bar & Filters */}
          <div className="mb-6 flex flex-col gap-4">
            <form onSubmit={(e) => e.preventDefault()} className="flex gap-4">
                <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${activeTab}s...`}
                className={`flex-1 px-6 py-4 rounded-xl text-lg outline-none ${
                    theme === 'fancy' 
                    ? "bg-white/5 border border-white/10 focus:border-aiom-accent text-white" 
                    : "bg-white border-2 border-[#8b8b8b] text-black"
                }`}
                />
                
            </form>
            
            <div className="flex gap-4">
                <select 
                    value={filterVersion}
                    onChange={(e) => setFilterVersion(e.target.value)}
                    className={`px-4 py-2 rounded-lg outline-none appearance-none cursor-pointer ${
                        theme === 'fancy' 
                        ? "bg-white/5 border border-white/10 text-white" 
                        : "bg-white border-2 border-[#8b8b8b] text-black"
                    }`}
                >
                    <option value="">All Versions</option>
                    {availableVersions.map(v => (
                        <option key={v} value={v}>{v}</option>
                    ))}
                </select>

                <select 
                    value={filterLoader}
                    onChange={(e) => setFilterLoader(e.target.value)}
                    className={`px-4 py-2 rounded-lg outline-none appearance-none cursor-pointer ${
                        theme === 'fancy' 
                        ? "bg-white/5 border border-white/10 text-white" 
                        : "bg-white border-2 border-[#8b8b8b] text-black"
                    }`}
                >
                    <option value="">All Loaders</option>
                    <option value="fabric">Fabric</option>
                    <option value="forge">Forge</option>
                    <option value="neoforge">NeoForge</option>
                    <option value="quilt">Quilt</option>
                </select>
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((item) => (
              <div 
                key={item.project_id}
                onClick={() => { setSelectedProject(item); setShowInstallModal(true); }}
                className={`p-4 rounded-xl cursor-pointer transition-transform hover:scale-[1.02] flex flex-col h-full ${
                  theme === 'fancy' 
                    ? "bg-white/5 hover:bg-white/10 border border-white/5" 
                    : "bg-[#c6c6c6] border-2 border-[#8b8b8b] text-black"
                }`}
              >
                {item.icon_url && (
                  <img src={item.icon_url} alt={item.title} className="w-16 h-16 rounded-lg mb-3 object-cover bg-black/20" />
                )}
                <h3 className="font-bold text-lg leading-tight mb-1">{item.title}</h3>
                <p className="text-xs opacity-70 mb-2">{item.author}</p>
                <p className="text-sm opacity-60 line-clamp-3 flex-1">{item.description}</p>
                <div className="mt-4 flex items-center gap-2 text-xs opacity-50">
                  <Download size={12} />
                  <span>{item.downloads} downloads</span>
                </div>
              </div>
            ))}
            
            {results.length === 0 && !isSearching && query && (
              <div className="col-span-full text-center py-12 opacity-50">
                No results found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Install Modal */}
      {showInstallModal && selectedProject && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl shadow-2xl ${theme === 'fancy' ? "bg-[#1e1e2e] border border-white/10 text-white" : "bg-[#c6c6c6] border-4 border-white text-black"}`}>
            <h2 className="text-2xl font-bold mb-4">Install {selectedProject.title}</h2>
            
            {selectedProject.project_type !== 'modpack' && (
              <div className="mb-6">
                <label className="block text-sm font-bold mb-2 opacity-70">Select Target Mod Pack</label>
                <select 
                  value={targetPack} 
                  onChange={(e) => setTargetPack(e.target.value)}
                  className={`w-full p-3 rounded-xl outline-none ${
                    theme === 'fancy' 
                      ? "bg-black/20 border border-white/10 text-white focus:border-aiom-accent" 
                      : "bg-white border-2 border-[#8b8b8b] text-black"
                  }`}
                >
                  <option value="">-- Select Pack --</option>
                  {availablePacks.map(p => (
                    <option key={p.name} value={p.name} className="text-black">{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedProject.project_type === 'modpack' && (
               <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 text-sm">
                 Note: This will be installed as a new Mod Pack.
               </div>
            )}

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowInstallModal(false)}
                disabled={isInstalling}
                className="px-4 py-2 opacity-70 hover:opacity-100"
              >
                Cancel
              </button>
              <button 
                onClick={handleInstall}
                disabled={isInstalling || (selectedProject.project_type !== 'modpack' && !targetPack)}
                className={`px-6 py-2 font-bold rounded-xl flex items-center gap-2 ${
                  theme === 'fancy' 
                    ? "bg-aiom-accent text-aiom-bg disabled:opacity-50" 
                    : "bg-[#00a4ef] text-white border-2 border-white disabled:opacity-50"
                }`}
              >
                {isInstalling ? (
                  <>
                    <Loader size={18} className="animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Install
                  </>
                )}
              </button>
            </div>

            {installProgress && (
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-1 opacity-70">
                  <span>{installProgress.status}</span>
                  <span>{Math.round(installProgress.percent * 100)}%</span>
                </div>
                <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-aiom-accent transition-all duration-300"
                    style={{ width: `${installProgress.percent * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Browse;
