import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (typeof window !== 'undefined') {
  if (!(window as any).electronAPI) {
    (window as any).electronAPI = {};
  }
  const api: any = (window as any).electronAPI;
  const defaults: Record<string, any> = {
    updateDiscordPresence: async () => {},
    checkTutorial: async () => {
      try {
        const done = localStorage.getItem('aiom_tutorial_done');
        if (done === 'true') return true;
        return false;
      } catch {
        return false;
      }
    },
    completeTutorial: async () => {
      try {
        localStorage.setItem('aiom_tutorial_done', 'true');
      } catch {}
    },
    getGlobalConfig: async () => ({ accounts: [], minecraftVerified: false, offlineName: '' }),
    getRunningProcesses: async () => [],
    onRunningProcesses: () => () => {},
    stopMinecraft: async () => {},
    getModPacks: async () => {
      try {
        const data = localStorage.getItem('aiom_packs');
        if (data) return JSON.parse(data);
      } catch {}
      return [];
    },
    launchMinecraft: async () => ({ success: false, error: 'Not available on this platform' }),
    searchModrinth: async () => [],
    installProject: async () => ({ success: false, error: 'Not available on this platform' }),
    fetchKingVersions: async () => [],
    fetchKingMods: async () => [],
    installKingMod: async () => ({ success: false, error: 'Not available on this platform' }),
    onDownloadProgress: () => () => {},
    getMinecraftVersions: async () => [],
    openModPackFolder: async () => {},
    deleteModPack: async (name: string) => {
      try {
        const data = localStorage.getItem('aiom_packs');
        if (data) {
          const packs = JSON.parse(data).filter((p: any) => p.name !== name);
          localStorage.setItem('aiom_packs', JSON.stringify(packs));
        }
      } catch {}
    },
    createModPack: async (name: string, loader: string, version: string) => {
      try {
        const data = localStorage.getItem('aiom_packs');
        const packs = data ? JSON.parse(data) : [];
        const pack = { name, loader, version, created: new Date().toISOString() };
        packs.push(pack);
        localStorage.setItem('aiom_packs', JSON.stringify(packs));
        return { success: true, meta: pack };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
    getMods: async () => [],
    enableMod: async () => {},
    disableMod: async () => {},
    deleteMod: async () => {},
    getConfig: async () => ({}),
    saveConfig: async () => {},
    openExternal: async () => {},
    verifyMinecraft: async () => ({ success: false, error: 'Not available on this platform' }),
    startMicrosoftLogin: async () => ({ success: false, error: 'Not available on this platform' }),
    getNbtWorlds: async () => [],
    readNbt: async () => null,
    writeNbt: async () => {}
  };
  const methods = Object.keys(defaults);
  for (const m of methods) {
    if (typeof api[m] === 'undefined') {
      api[m] = defaults[m];
    }
  }
  // Ensure any other common methods exist
  if (typeof api.onRunningProcesses === 'undefined') api.onRunningProcesses = () => () => {};
  if (typeof api.onDownloadProgress === 'undefined') api.onDownloadProgress = () => () => {};
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
