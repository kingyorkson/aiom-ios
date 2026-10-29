import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getModPacks: () => ipcRenderer.invoke('get-mod-packs'),
  createModPack: (name: string, loader: string, version: string) => ipcRenderer.invoke('create-mod-pack', name, loader, version),
  checkTutorial: () => ipcRenderer.invoke('check-tutorial'),
  completeTutorial: () => ipcRenderer.invoke('complete-tutorial'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),
  
  // New Features
  launchGame: (packName: string, worldName?: string, serverIp?: string) => ipcRenderer.invoke('launch-game', packName, worldName, serverIp),
  stopMinecraft: (processId: string) => ipcRenderer.invoke('stop-minecraft', processId),
  getRunningProcesses: () => ipcRenderer.invoke('get-running-processes'),
  onRunningProcesses: (callback: (procs: any[]) => void) => ipcRenderer.on('running-processes', (_event, value) => callback(value)),
  openPackFolder: (packName: string) => ipcRenderer.invoke('open-pack-folder', packName),
  exportPack: (packName: string, files: string[]) => ipcRenderer.invoke('export-pack', packName, files),
  
  // Global Settings
  getGlobalConfig: () => ipcRenderer.invoke('get-global-config'),
  fetchKingVersions: () => ipcRenderer.invoke('fetch-king-versions'),
  fetchKingMods: (version: string) => ipcRenderer.invoke('fetch-king-mods', version),
  installKingMod: (packName: string, modUrl: string, modName: string) => ipcRenderer.invoke('install-king-mod', packName, modUrl, modName),
  saveGlobalConfig: (config: any) => ipcRenderer.invoke('save-global-config', config),
  loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
  addOfflineAccount: (name: string) => ipcRenderer.invoke('add-offline-account', name),
  selectAccount: (accountId: string) => ipcRenderer.invoke('select-account', accountId),
  removeAccount: (accountId: string) => ipcRenderer.invoke('remove-account', accountId),
  logoutAccounts: () => ipcRenderer.invoke('logout-accounts'),
  
  // Browse
  analyzeUrl: (url: string) => ipcRenderer.invoke('analyze-url', url),
  installFromUrl: (url: string, packName: string) => ipcRenderer.invoke('install-from-url', url, packName),
  
  // Skins
  selectSkinFile: () => ipcRenderer.invoke('select-skin-file'),
  saveSkin: (srcPath: string) => ipcRenderer.invoke('save-skin', srcPath),
  listSkins: () => ipcRenderer.invoke('list-skins'),
  assignAccountSkin: (accountId: string, skinPath: string) => ipcRenderer.invoke('assign-account-skin', accountId, skinPath),
  
  // Java
  installJava: (major: number) => ipcRenderer.invoke('install-java', major),
  getJavaPath: () => ipcRenderer.invoke('get-java-path'),
  setJavaPath: (path: string) => ipcRenderer.invoke('set-java-path', path),
  selectJavaBinary: () => ipcRenderer.invoke('select-java-binary'),
  
  // File System (for export selection)
  getPackFiles: (packName: string) => ipcRenderer.invoke('get-pack-files', packName),
  getInstalledMods: (packName: string) => ipcRenderer.invoke('get-installed-mods', packName),

  // NBT Editor & Import
  getAllWorlds: () => ipcRenderer.invoke('get-all-worlds'),
  readLevelDat: (packName: string, worldFolder: string) => ipcRenderer.invoke('read-level-dat', packName, worldFolder),
  saveLevelDat: (packName: string, worldFolder: string, data: any) => ipcRenderer.invoke('save-level-dat', packName, worldFolder, data),
  importInstance: () => ipcRenderer.invoke('import-instance'),
  importAIOMPack: () => ipcRenderer.invoke('import-aiom-pack'),

  // Search & Install
  getMinecraftVersions: () => ipcRenderer.invoke('get-minecraft-versions'),
  searchModrinth: (query: string, type?: string, version?: string, loader?: string) => ipcRenderer.invoke('search-modrinth', query, type, version, loader),
  installProject: (project: any, packName?: string) => ipcRenderer.invoke('install-project', project, packName),
  deleteModPack: (packName: string) => ipcRenderer.invoke('delete-mod-pack', packName),
  onDownloadProgress: (callback: (progress: any) => void) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  updateDiscordPresence: (details: string, state?: string) => ipcRenderer.invoke('update-discord-presence', details, state),
  
  // Launch status stream
  onLaunchStatus: (callback: (status: any) => void) => ipcRenderer.on('launch-status', (_event, value) => callback(value)),
  onPackUpdated: (callback: (info: any) => void) => ipcRenderer.on('pack-updated', (_event, value) => callback(value)),
  
  // Astro updates
  updateFromAstro: (packName: string) => ipcRenderer.invoke('update-from-astro', packName),
  onUpdateProgress: (callback: (progress: any) => void) => ipcRenderer.on('update-progress', (_event, value) => callback(value)),
  
  // Minecraft Verification
  verifyMinecraft: () => ipcRenderer.invoke('verify-minecraft'),
  getMinecraftVerification: () => ipcRenderer.invoke('get-minecraft-verification'),
});
