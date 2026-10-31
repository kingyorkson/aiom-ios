import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (typeof window !== 'undefined') {
  if (!(window as any).electronAPI) {
    (window as any).electronAPI = {};
  }
  const api: any = (window as any).electronAPI;
  const noop = async (..._args: any[]) => {};
  const noopSync = () => {};
  const methods = [
    'updateDiscordPresence',
    'checkTutorial',
    'completeTutorial',
    'getGlobalConfig',
    'getRunningProcesses',
    'onRunningProcesses',
    'stopMinecraft',
    'getModPacks',
    'launchMinecraft',
    'searchModrinth',
    'installProject',
    'fetchKingVersions',
    'fetchKingMods',
    'installKingMod',
    'onDownloadProgress',
    'getMinecraftVersions',
    'openModPackFolder',
    'deleteModPack',
    'createModPack',
    'getMods',
    'enableMod',
    'disableMod',
    'deleteMod',
    'getConfig',
    'saveConfig',
    'openExternal',
    'verifyMinecraft',
    'startMicrosoftLogin'
  ];
  for (const m of methods) {
    if (typeof api[m] === 'undefined') {
      if (m === 'onRunningProcesses' || m === 'onDownloadProgress') {
        api[m] = () => noopSync;
      } else {
        api[m] = noop;
      }
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
