import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Database, Save } from 'lucide-react';

const NBTEditor: React.FC = () => {
  const { theme } = useTheme();
  const [worlds, setWorlds] = useState<any[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<any | null>(null);
  const [nbtData, setNbtData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Form State
  const [levelName, setLevelName] = useState('');
  const [seed, setSeed] = useState('');
  const [time, setTime] = useState('');
  const [gameType, setGameType] = useState('0');

  useEffect(() => {
    loadWorlds();
  }, []);

  const loadWorlds = async () => {
    setLoading(true);
    const list = await window.electronAPI.getAllWorlds();
    setWorlds(list);
    setLoading(false);
  };

  const handleSelectWorld = async (world: any) => {
    setSelectedWorld(world);
    setLoading(true);
    try {
      const data = await window.electronAPI.readLevelDat(world.packName, world.folderName);
      if (data) {
        const root = data.Data || data; // Handle different level.dat structures
        setNbtData(root);
        setLevelName(root.LevelName || '');
        setSeed(root.RandomSeed ? root.RandomSeed.toString() : '');
        setTime(root.Time ? root.Time.toString() : '');
        setGameType(root.GameType !== undefined ? root.GameType.toString() : '0');
      } else {
        alert('Failed to read level.dat');
      }
    } catch (e) {
      console.error(e);
      alert('Error reading NBT data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedWorld) return;
    try {
      const result = await window.electronAPI.saveLevelDat(selectedWorld.packName, selectedWorld.folderName, {
        LevelName: levelName,
        RandomSeed: seed,
        Time: time,
        GameType: gameType
      });
      
      if (result.success) {
        alert('World data saved successfully!');
        loadWorlds(); // Refresh names
      } else {
        alert('Failed to save: ' + result.error);
      }
    } catch (e) {
      alert('Error saving data');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Database size={32} />
          NBT Editor
        </h1>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* World List */}
        <div className={`w-1/3 overflow-auto rounded-2xl ${theme === 'fancy' ? "bg-white/5 border border-white/5" : "bg-[#c6c6c6] border-2 border-[#555555] text-black"}`}>
          <div className="p-4 border-b border-white/10">
            <h2 className="font-bold text-lg">Select World</h2>
          </div>
          <div className="p-2">
            {worlds.map((world, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectWorld(world)}
                className={`w-full text-left p-3 rounded-xl mb-2 transition-all ${
                  selectedWorld?.path === world.path
                    ? (theme === 'fancy' ? "bg-aiom-accent text-aiom-bg font-bold" : "bg-[#555555] text-white")
                    : (theme === 'fancy' ? "hover:bg-white/10" : "hover:bg-white/50")
                }`}
              >
                <div className="font-bold truncate">{world.name}</div>
                <div className="text-xs opacity-60 truncate">Pack: {world.packName}</div>
                <div className="text-xs opacity-40 truncate font-mono">{world.folderName}</div>
              </button>
            ))}
            {worlds.length === 0 && !loading && (
              <div className="p-4 text-center opacity-50">No worlds found in any mod pack.</div>
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className={`flex-1 overflow-auto rounded-2xl p-6 ${theme === 'fancy' ? "bg-white/5 border border-white/5" : "bg-[#c6c6c6] border-2 border-[#555555] text-black"}`}>
          {selectedWorld && nbtData ? (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold">{selectedWorld.name}</h2>
                  <p className="opacity-60 text-sm">Editing level.dat</p>
                </div>
                <button
                  onClick={handleSave}
                  className={`px-6 py-2 rounded-xl font-bold flex items-center gap-2 ${
                    theme === 'fancy' 
                      ? "bg-green-500 text-white hover:scale-105 shadow-lg shadow-green-500/20" 
                      : "bg-[#8b8b8b] text-white border-2 border-white"
                  }`}
                >
                  <Save size={18} />
                  Save Changes
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-black/10 rounded-xl">
                  <label className="block text-sm font-bold mb-2 opacity-70">World Name</label>
                  <input
                    type="text"
                    value={levelName}
                    onChange={(e) => setLevelName(e.target.value)}
                    className={`w-full p-3 rounded-lg outline-none ${
                      theme === 'fancy' 
                        ? "bg-black/20 border border-white/10 focus:border-aiom-accent text-white" 
                        : "bg-white border border-gray-500 text-black"
                    }`}
                  />
                </div>

                <div className="p-4 bg-black/10 rounded-xl">
                  <label className="block text-sm font-bold mb-2 opacity-70">Random Seed (Long)</label>
                  <input
                    type="text"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    className={`w-full p-3 rounded-lg outline-none font-mono ${
                      theme === 'fancy' 
                        ? "bg-black/20 border border-white/10 focus:border-aiom-accent text-white" 
                        : "bg-white border border-gray-500 text-black"
                    }`}
                  />
                </div>

                <div className="p-4 bg-black/10 rounded-xl">
                  <label className="block text-sm font-bold mb-2 opacity-70">Time (Ticks)</label>
                  <input
                    type="number"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={`w-full p-3 rounded-lg outline-none font-mono ${
                      theme === 'fancy' 
                        ? "bg-black/20 border border-white/10 focus:border-aiom-accent text-white" 
                        : "bg-white border border-gray-500 text-black"
                    }`}
                  />
                </div>

                <div className="p-4 bg-black/10 rounded-xl">
                  <label className="block text-sm font-bold mb-2 opacity-70">Game Mode</label>
                  <select
                    value={gameType}
                    onChange={(e) => setGameType(e.target.value)}
                    className={`w-full p-3 rounded-lg outline-none ${
                      theme === 'fancy' 
                        ? "bg-black/20 border border-white/10 focus:border-aiom-accent text-white" 
                        : "bg-white border border-gray-500 text-black"
                    }`}
                  >
                    <option value="0">Survival (0)</option>
                    <option value="1">Creative (1)</option>
                    <option value="2">Adventure (2)</option>
                    <option value="3">Spectator (3)</option>
                  </select>
                </div>

                <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-200 text-sm">
                  <strong>Note:</strong> This is a simplified NBT editor. Advanced NBT structure changes are not yet supported to prevent world corruption.
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-50">
              <Database size={64} className="mb-4" />
              <p className="text-xl">Select a world to edit NBT data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NBTEditor;