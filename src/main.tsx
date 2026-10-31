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
    checkTutorial: async () => true,
    completeTutorial: async () => {},
    getGlobalConfig: async () => ({ accounts: [], minecraftVerified: false, offlineName: '' }),
    getRunningProcesses: async () => [],
    onRunningProcesses: () => () => {},
    stopMinecraft: async () => {},
    getModPacks: async () => [],
    launchMinecraft: async () => ({ success: false, error: 'Not available on this platform' }),
    searchModrinth: async () => [],
    installProject: async () => ({ success: false, error: 'Not available on this platform' }),
    fetchKingVersions: async () => [],
    fetchKingMods: async () => [],
    installKingMod: async () => ({ success: false, error: 'Not available on this platform' }),
    onDownloadProgress: () => () => {},
    getMinecraftVersions: async () => [],
    openModPackFolder: async () => {},
    deleteModPack: async () => {},
    createModPack: async () => ({ success: false, error: 'Not available on this platform' }),
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
