export interface ElectronAPI {
  getModPacks: () => Promise<any[]>;
  createModPack: (name: string, loader: string, version: string) => Promise<{ success: boolean; meta?: any; error?: string }>;
  checkTutorial: () => Promise<boolean>;
  completeTutorial: () => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  copyToClipboard: (text: string) => Promise<void>;
  
  launchGame: (packName: string, worldName?: string, serverIp?: string) => Promise<boolean>;
  stopMinecraft: (processId: string) => Promise<{ success: boolean; error?: string }>;
  getRunningProcesses: () => Promise<any[]>;
  onRunningProcesses: (callback: (procs: any[]) => void) => void;
  onLaunchStatus: (callback: (status: any) => void) => void;
  openPackFolder: (packName: string) => Promise<void>;
  exportPack: (packName: string, files: string[]) => Promise<{ success: boolean; path?: string; error?: string }>;
  
  loginMicrosoft: () => Promise<{ success: boolean; account?: any; error?: string }>;
  addOfflineAccount: (name: string) => Promise<{ success: boolean; account?: any; error?: string }>;
  selectAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  removeAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  logoutAccounts: () => Promise<{ success: boolean; error?: string }>;
  getGlobalConfig: () => Promise<any>;
  fetchKingVersions: () => Promise<any[]>;
  fetchKingMods: (version: string) => Promise<any[]>;
  installKingMod: (packName: string, modUrl: string, modName: string) => Promise<{ success: boolean; error?: string }>;
  saveGlobalConfig: (config: any) => Promise<boolean>;
  
  analyzeUrl: (url: string) => Promise<{ type: string; name: string } | null>;
  installFromUrl: (url: string, packName: string) => Promise<{ success: boolean; error?: string }>;
  
  selectSkinFile: () => Promise<string | null>;
  saveSkin: (srcPath: string) => Promise<{ success: boolean; path?: string; name?: string; error?: string }>;
  listSkins: () => Promise<Array<{ name: string; path: string; size: number }>>;
  assignAccountSkin: (accountId: string, skinPath: string) => Promise<{ success: boolean; error?: string }>;
  
  installJava: (major: number) => Promise<{ success: boolean; path?: string; vendor?: string; error?: string }>;
  getJavaPath: () => Promise<string | null>;
  setJavaPath: (path: string) => Promise<boolean>;
  selectJavaBinary: () => Promise<string | null>;

  getPackFiles: (packName: string) => Promise<string[]>;
  getInstalledMods: (packName: string) => Promise<Array<{ name: string; size: number }>>;

  getAllWorlds: () => Promise<any[]>;
  readLevelDat: (packName: string, worldFolder: string) => Promise<any>;
  saveLevelDat: (packName: string, worldFolder: string, data: any) => Promise<{ success: boolean; error?: string }>;
  importInstance: () => Promise<{ success: boolean; error?: string }>;
  importAIOMPack: () => Promise<{ success: boolean; error?: string }>;

  getMinecraftVersions: () => Promise<any[]>;
  searchModrinth: (query: string, type?: string, version?: string, loader?: string) => Promise<any[]>;
  installProject: (project: any, packName?: string) => Promise<{ success: boolean; file?: string; error?: string }>;
  deleteModPack: (packName: string) => Promise<{ success: boolean; error?: string }>;
  onDownloadProgress: (callback: (progress: { percent: number; status: string }) => void) => void;
  updateDiscordPresence: (details: string, state?: string) => Promise<void>;
  onLaunchStatus: (callback: (status: any) => void) => void;
  onPackUpdated: (callback: (info: any) => void) => void;
  updateFromAstro: (packName: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateProgress: (callback: (progress: { packName: string; percent: number; file?: string }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
