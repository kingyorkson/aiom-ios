import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { Search, Download, ArrowLeft, Loader, Filter, Box, Layers, Zap } from 'lucide-react';

const AddContent: React.FC = () => {
  const { packName } = useParams<{ packName: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();

  // View State: 'category' | 'browse'
  const [view, setView] = useState<'category' | 'browse'>('category');

  // Pack Info
  const [packInfo, setPackInfo] = useState<any>(null);

  // Search State
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('mod'); // mod, resourcepack, shader
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  // KingModLoader Specific
  const [allKingMods, setAllKingMods] = useState<any[]>([]);
  const [kingVersions, setKingVersions] = useState<any[]>([]);

  // Filters (for Modrinth/CurseForge)
  const [filterVersion, setFilterVersion] = useState('');
  const [filterLoader, setFilterLoader] = useState('');

  // Debounce query
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(handler);
  }, [query]);

  // Initial Load
  useEffect(() => {
    loadPackInfo();
    if (packName) {
      try { (window.electronAPI as any)?.updateDiscordPresence?.(`Adding Content to ${packName}`); } catch {}
    }
  }, [packName]);

  useEffect(() => {
    const loadKingVersions = async () => {
      try {
        const v = await window.electronAPI.fetchKingVersions();
        if (v && v.length > 0) {
          setKingVersions(v);
          if (!filterVersion) {
            setFilterVersion(v[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load King versions', e);
      }
    };
    if (packInfo?.loader === 'KingModLoader') {
      loadKingVersions();
    }
  }, [packInfo?.loader]);

  const loadPackInfo = async () => {
    if (!packName) return;
    const packs = await window.electronAPI.getModPacks();
    const p = packs.find((p: any) => p.name === packName);
    if (p) {
      setPackInfo(p);
      setFilterVersion(p.version || '');
      // Map loader names if necessary (e.g. 'KingModLoader' -> special handling)
      if (p.loader && p.loader !== 'KingModLoader') {
          setFilterLoader(p.loader.toLowerCase());
      }
    }
  };

  // Search Effect
  useEffect(() => {
    if (!packInfo || view !== 'browse') return;

    if (packInfo.loader === 'KingModLoader') {
      handleKingSearch();
    } else {
      handleStandardSearch();
    }
  }, [debouncedQuery, packInfo, activeTab, filterVersion, filterLoader, view]);

  const handleKingSearch = async () => {
    setLoading(true);
    try {
      // Fetch all if not already fetched (cache in state)
      let mods = allKingMods;
      if (mods.length === 0) {
        const v = filterVersion || packInfo.version;
        mods = await window.electronAPI.fetchKingMods(v);
        setAllKingMods(mods);
      }

      // Filter locally
      let filtered = mods;
      if (debouncedQuery) {
        const q = debouncedQuery.toLowerCase();
        filtered = mods.filter((m: any) => 
          m.name.toLowerCase().includes(q) || 
          (m.description && m.description.toLowerCase().includes(q))
        );
      }
      setResults(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStandardSearch = async () => {
    setLoading(true);
    try {
      // Use Modrinth search with filters
      let q = debouncedQuery;
      // Empty search is allowed
      
      const hits = await window.electronAPI.searchModrinth(q, activeTab, filterVersion, filterLoader); 
      setResults(hits);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (item: any) => {
    if (installingId) return;
    setInstallingId(item.id || item.project_id);
    
    try {
      if (packInfo.loader === 'KingModLoader') {
        // King metadata: item.id is the filename.
        await window.electronAPI.installKingMod(packInfo.name, item.url, item.id);
        alert('Installed ' + item.name);
      } else {
        // Standard install
        const res = await window.electronAPI.installProject(item, packInfo.name);
        if (res.success) alert('Installed!');
        else alert('Failed: ' + res.error);
      }
    } catch (e) {
      alert('Error installing');
    } finally {
      setInstallingId(null);
    }
  };

  const selectCategory = (category: string) => {
    setActiveTab(category);
    setView('browse');
    setQuery(''); // Reset query when switching categories
    setResults([]); // Clear previous results
  };

  if (!packInfo) return <div className="p-10 text-center">Loading pack info...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => {
            if (view === 'browse') setView('category');
            else navigate(-1);
        }} className={`p-2 rounded-full ${theme === 'fancy' ? "bg-white/10 hover:bg-white/20" : "bg-gray-300 hover:bg-gray-400"}`}>
          <ArrowLeft size={24} className={theme === 'fancy' ? "text-white" : "text-black"} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Add Content to {packInfo.name}</h1>
          <p className="opacity-70 text-sm">{packInfo.loader} {packInfo.version}</p>
        </div>
      </div>

      {view === 'category' ? (
        <div className="flex-1 flex flex-col justify-center items-center pb-20">
             <h2 className="text-3xl font-bold mb-8 opacity-80">What would you like to add?</h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                 <button 
                    onClick={() => selectCategory('mod')}
                    className={`p-8 rounded-2xl flex flex-col items-center gap-4 transition-all hover:scale-105 ${
                        theme === 'fancy' 
                        ? "bg-white/5 hover:bg-white/10 border border-white/10" 
                        : "bg-[#c6c6c6] border-4 border-white text-black"
                    }`}
                 >
                    <Box size={64} className="opacity-80" />
                    <span className="text-2xl font-bold">Mods</span>
                 </button>

                 <button 
                    onClick={() => selectCategory('resourcepack')}
                    className={`p-8 rounded-2xl flex flex-col items-center gap-4 transition-all hover:scale-105 ${
                        theme === 'fancy' 
                        ? "bg-white/5 hover:bg-white/10 border border-white/10" 
                        : "bg-[#c6c6c6] border-4 border-white text-black"
                    }`}
                 >
                    <Layers size={64} className="opacity-80" />
                    <span className="text-2xl font-bold">Resource Packs</span>
                 </button>

                 <button 
                    onClick={() => selectCategory('shader')}
                    className={`p-8 rounded-2xl flex flex-col items-center gap-4 transition-all hover:scale-105 ${
                        theme === 'fancy' 
                        ? "bg-white/5 hover:bg-white/10 border border-white/10" 
                        : "bg-[#c6c6c6] border-4 border-white text-black"
                    }`}
                 >
                    <Zap size={64} className="opacity-80" />
                    <span className="text-2xl font-bold">Shaders</span>
                 </button>
             </div>
        </div>
      ) : (
        <>
            {/* Search & Filter Bar */}
            <div className={`p-4 rounded-xl mb-6 flex flex-col md:flex-row gap-4 ${theme === 'fancy' ? "bg-white/5" : "bg-[#c6c6c6] border-2 border-[#8b8b8b]"}`}>
                <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50" size={20} />
                <input 
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${activeTab}s...`}
                    className={`w-full pl-12 pr-4 py-3 rounded-xl outline-none ${
                        theme === 'fancy' 
                        ? "bg-black/20 border border-white/10 focus:border-aiom-accent text-white" 
                        : "bg-white border-2 border-[#8b8b8b] text-black"
                    }`}
                    autoFocus
                />
                </div>
                
                {packInfo.loader !== 'KingModLoader' ? (
                <div className="flex gap-2">
                    <div className="relative">
                        <select 
                        value={filterVersion}
                        onChange={(e) => setFilterVersion(e.target.value)}
                        className={`appearance-none pl-4 pr-10 py-3 rounded-xl outline-none font-bold ${
                            theme === 'fancy' ? "bg-black/20 text-white border border-white/10" : "bg-white text-black border-2 border-[#8b8b8b]"
                        }`}
                        >
                        <option value="">All Versions</option>
                        <option value={packInfo.version}>{packInfo.version} (Recommended)</option>
                        </select>
                        <Filter className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" size={16} />
                    </div>
                    
                    <div className="relative">
                        <select 
                        value={filterLoader}
                        onChange={(e) => setFilterLoader(e.target.value)}
                        className={`appearance-none pl-4 pr-10 py-3 rounded-xl outline-none font-bold ${
                            theme === 'fancy' ? "bg-black/20 text-white border border-white/10" : "bg-white text-black border-2 border-[#8b8b8b]"
                        }`}
                        >
                        <option value="">All Loaders</option>
                        <option value={packInfo.loader.toLowerCase()}>{packInfo.loader} (Recommended)</option>
                        <option value="fabric">Fabric</option>
                        <option value="forge">Forge</option>
                        <option value="quilt">Quilt</option>
                        <option value="neoforge">NeoForge</option>
                        </select>
                        <Filter className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" size={16} />
                    </div>
                </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative">
                      <select
                        value={filterVersion}
                        onChange={(e) => { setFilterVersion(e.target.value); setAllKingMods([]); }}
                        className={`appearance-none pl-4 pr-10 py-3 rounded-xl outline-none font-bold ${
                          theme === 'fancy' ? "bg-black/20 text-white border border-white/10" : "bg-white text-black border-2 border-[#8b8b8b]"
                        }`}
                      >
                        {kingVersions.map(v => (
                          <option key={v.id} value={v.id} className="text-black">{v.name}</option>
                        ))}
                      </select>
                      <Filter className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" size={16} />
                    </div>
                  </div>
                )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-auto">
                {loading && results.length === 0 ? (
                <div className="flex justify-center py-20">
                    <Loader className="animate-spin" size={40} />
                </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
                    {results.map((item: any) => (
                    <div 
                        key={item.id || item.project_id} 
                        className={`p-4 rounded-xl flex flex-col ${
                        theme === 'fancy' 
                            ? "bg-white/5 border border-white/5 hover:bg-white/10" 
                            : "bg-[#dcdcdc] border-2 border-[#8b8b8b] text-black"
                        }`}
                    >
                        <div className="flex gap-4 mb-3">
                        {item.icon_url && (
                            <img src={item.icon_url} alt="" className="w-16 h-16 rounded-lg bg-black/20 object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold truncate" title={item.name || item.title}>{item.name || item.title}</h3>
                            <p className="text-xs opacity-70 truncate">{item.author}</p>
                        </div>
                        </div>
                        
                        <p className="text-sm opacity-60 line-clamp-2 mb-4 flex-1">
                        {item.description}
                        </p>

                        <button
                        onClick={() => handleInstall(item)}
                        disabled={installingId === (item.id || item.project_id)}
                        className={`w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 ${
                            theme === 'fancy'
                            ? "bg-aiom-accent text-aiom-bg hover:scale-[1.02] transition-transform"
                            : "bg-[#00a4ef] text-white border-2 border-white"
                        }`}
                        >
                        {installingId === (item.id || item.project_id) ? (
                            <Loader size={16} className="animate-spin" />
                        ) : (
                            <Download size={16} />
                        )}
                        Install
                        </button>
                    </div>
                    ))}
                    
                    {!loading && results.length === 0 && (
                    <div className="col-span-full text-center py-20 opacity-50">
                        No results found.
                    </div>
                    )}
                </div>
                )}
            </div>
        </>
      )}
    </div>
  );
};

export default AddContent;
