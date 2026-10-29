import { app, BrowserWindow, ipcMain, shell, clipboard, dialog } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import archiver from 'archiver';
import * as nbt from 'prismarine-nbt';
import { promisify } from 'util';
import * as zlib from 'zlib';
import { Client } from 'minecraft-launcher-core';
import { Auth } from 'msmc';
import axios from 'axios';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import DiscordRPC from 'discord-rpc';
import { execFileSync, spawnSync, spawn } from 'child_process';
import os from 'os';
import Jimp from 'jimp';

const launcher = new Client();
const parseNbt = promisify(nbt.parse);
const gzip = promisify(zlib.gzip);

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const JAVA_BIN = IS_WIN ? 'java.exe' : 'java';
const PATH_SEP = IS_WIN ? ';' : ':';
function javaSearchBases(): string[] {
  const bases: string[] = [];
  if (IS_WIN) {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    bases.push(
      path.join(pf, 'Java'), path.join(pf, 'Zulu'), path.join(pf, 'Eclipse Adoptium'),
      path.join(pf, 'Microsoft'), path.join(pf, 'Amazon Corretto'),
      path.join(pf86, 'Java'), path.join(pf86, 'Zulu'), path.join(pf86, 'Eclipse Adoptium')
    );
  } else if (IS_MAC) {
    bases.push('/Library/Java/JavaVirtualMachines', '/System/Library/Java/JavaVirtualMachines');
  } else {
    bases.push(
      '/usr/lib/jvm', '/usr/java', '/opt/java', '/opt/jdk',
      path.join(os.homedir(), '.jdks'),
      path.join(os.homedir(), '.sdkman/candidates/java')
    );
  }
  return bases;
}
function findOnPath(bin: string): string | null {
  for (const p of String(process.env.PATH || '').split(PATH_SEP)) {
    if (!p) continue;
    const c = path.join(p, bin);
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return null;
}
async function findFileRecursive(base: string, target: string): Promise<string | null> {
  const entries = await fs.readdir(base);
  for (const entry of entries) {
    const full = path.join(base, entry);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      const found: string | null = await findFileRecursive(full, target);
      if (found) return found;
    } else if (entry.toLowerCase() === target.toLowerCase()) {
      return full;
    }
  }
  return null;
}
function requiredJavaMajor(mcVersion: string) {
  const s = String(mcVersion || '').trim();
  const m = s.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return 21;
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  const patch = parseInt(m[3] || '0', 10);
  if (major === 1) {
    if (minor >= 21) return 21;
    if (minor === 20) return patch >= 5 ? 21 : 17;
    if (minor >= 18) return 17;
    return 8;
  }
  // Calendar-style versioning (26.x and newer) targets Java 25
  if (major >= 26) return 25;
  return 21;
}
function parseJavaMajorFromVersion(ver: string) {
  const s = String(ver || '').toLowerCase();
  const m = s.match(/version\s+"?([\d\._]+)/);
  const v = m ? m[1] : '';
  if (!v) return null;
  if (v.startsWith('1.8')) return 8;
  const n = parseInt(v.split('.')[0], 10);
  return isNaN(n) ? null : n;
}
function detectJavaMajor(javaExe: string): number | null {
  try {
    const res = spawnSync(javaExe, ['-version'], { encoding: 'utf8' });
    const text = `${res.stdout || ''}\n${res.stderr || ''}`;
    return parseJavaMajorFromVersion(text);
  } catch {
    return null;
  }
}
let _manifestCache: { at: number; data: any } | null = null;
async function getVersionManifest(): Promise<any> {
  if (_manifestCache && Date.now() - _manifestCache.at < 10 * 60 * 1000) return _manifestCache.data;
  const res = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
    timeout: 20000,
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'aiom-launcher' }
  });
  _manifestCache = { at: Date.now(), data: res.data };
  return res.data;
}
async function resolveRequiredJavaMajor(mcVersion: string): Promise<number> {
  try {
    const id = await resolveValidMinecraftVersion(mcVersion);
    const manifest = await getVersionManifest();
    const entry = (manifest?.versions || []).find((v: any) => v.id === id);
    if (entry?.url) {
      const json = await axios.get(entry.url, { timeout: 15000 }).then(r => r.data);
      const maj = json?.javaVersion?.majorVersion;
      if (Number.isFinite(maj)) return maj;
    }
    return requiredJavaMajor(id);
  } catch {
    return requiredJavaMajor(mcVersion);
  }
}
function offlineUuid(name: string): string {
  const base = Buffer.from(`OfflinePlayer:${name}`, 'utf8');
  const md5 = crypto.createHash('md5').update(base).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString('hex');
  return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
}
async function downloadFile(url: string, dest: string, headers?: Record<string, string>): Promise<boolean> {
  try {
    const res = await axios({
      method: 'get',
      url,
      responseType: 'arraybuffer',
      maxRedirects: 10,
      timeout: 120000,
      headers: { 'User-Agent': 'aiom-launcher', ...(headers || {}) }
    });
    if (!res || !res.data) return false;
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, Buffer.from(res.data));
    return true;
  } catch {
    return false;
  }
}
async function extractArchive(archivePath: string, destDir: string): Promise<boolean> {
  try {
    await fs.ensureDir(destDir);
    if (archivePath.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(destDir, true);
      return true;
    }
    return await new Promise<boolean>((resolve) => {
      let done = false;
      try {
        const child = spawn('tar', ['-xzf', archivePath, '-C', destDir]);
        child.on('error', () => { if (!done) { done = true; resolve(false); } });
        child.on('close', (code) => { if (!done) { done = true; resolve(code === 0); } });
      } catch {
        if (!done) { done = true; resolve(false); }
      }
    });
  } catch {
    return false;
  }
}
async function findJavaExecutable(base: string): Promise<string | null> {
  const found = await findFileRecursive(base, JAVA_BIN).catch(() => null);
  if (found && !IS_WIN) {
    try { await fs.chmod(found, 0o755); } catch {}
  }
  return found;
}
function adoptiumOs(): string | null {
  if (IS_WIN) return 'windows';
  if (IS_MAC) return 'mac';
  return 'linux';
}
function azulArch(): string {
  if (process.arch === 'arm64') return 'aarch64';
  if (process.arch === 'ia32') return 'i686';
  return 'x86_64';
}
async function installFromArchive(
  vendor: 'zulu' | 'temurin' | 'microsoft',
  major: number,
  url: string,
  archiveExt: 'zip' | 'tar.gz'
): Promise<string | null> {
  const dlDir = path.join(APP_DATA_PATH, vendor);
  await fs.ensureDir(dlDir);
  const archive = path.join(dlDir, `${vendor}-jre-${major}.${archiveExt}`);
  const unzipDir = path.join(dlDir, `${vendor}-jre-${major}`);
  if (!(await downloadFile(url, archive))) return null;
  await fs.remove(unzipDir).catch(() => {});
  const ok = await extractArchive(archive, unzipDir);
  await fs.remove(archive).catch(() => {});
  if (!ok) return null;
  const javaExe = await findJavaExecutable(unzipDir);
  if (!javaExe) return null;
  const maj = detectJavaMajor(javaExe);
  const config = await getGlobalOptions();
  const cfg = { ...config, javaPath: javaExe, javaVendor: vendor, javaMajor: maj };
  await fs.writeJson(GLOBAL_CONFIG_FILE, cfg, { spaces: 2 });
  return javaExe;
}
async function ensureZuluJava(major: number) {
  const config = await getGlobalOptions();
  if (config.javaPath && await fs.pathExists(config.javaPath)) return config.javaPath;
  const osName = IS_WIN ? 'windows' : IS_MAC ? 'macos' : 'linux';
  const url = `https://api.azul.com/zulu/download/community/v1.0/bundles/latest/binary/?bundle_type=jre&jdk_version=${major}&os=${osName}&arch=${azulArch()}`;
  return installFromArchive('zulu', major, url, IS_WIN ? 'zip' : 'tar.gz');
}
async function ensureTemurinJava(major: number) {
  const config = await getGlobalOptions();
  if (config.javaPath && await fs.pathExists(config.javaPath)) return config.javaPath;
  const osName = adoptiumOs();
  if (!osName) return null;
  const arch = process.arch === 'arm64' ? 'aarch64' : (process.arch === 'ia32' ? 'x32' : 'x64');
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`;
  return installFromArchive('temurin', major, url, IS_WIN ? 'zip' : 'tar.gz');
}
async function ensureMicrosoftJava(major: number) {
  const config = await getGlobalOptions();
  if (config.javaPath && await fs.pathExists(config.javaPath)) return config.javaPath;
  let url = '';
  if (IS_WIN) url = `https://aka.ms/download-jdk/microsoft-jdk-${major}-windows-x64.zip`;
  else if (process.platform === 'linux') url = `https://aka.ms/download-jdk/microsoft-jdk-${major}-linux-x64.tar.gz`;
  else return null;
  return installFromArchive('microsoft', major, url, IS_WIN ? 'zip' : 'tar.gz');
}
async function findJavaMatchingMajor(baseDirs: string[], major: number): Promise<string | null> {
  for (const base of baseDirs) {
    if (!base) continue;
    if (!fs.existsSync(base)) continue;
    const direct = path.join(base, 'bin', JAVA_BIN);
    if (await fs.pathExists(direct) && detectJavaMajor(direct) === major) return direct;
    const entries = await fs.readdir(base).catch(() => [] as string[]);
    for (const entry of entries) {
      const candidates = [
        path.join(base, entry, 'bin', JAVA_BIN),
        path.join(base, entry, 'Contents', 'Home', 'bin', JAVA_BIN)
      ];
      for (const candidate of candidates) {
        if (await fs.pathExists(candidate) && detectJavaMajor(candidate) === major) return candidate;
      }
    }
  }
  return null;
}
async function ensureJavaPath(mcVersion: string) {
  const config = await getGlobalOptions();
  const major = await resolveRequiredJavaMajor(mcVersion);
  if (config.javaPath && await fs.pathExists(config.javaPath)) {
    if (detectJavaMajor(config.javaPath) === major) return config.javaPath;
  }
  const pathJava = findOnPath(JAVA_BIN);
  if (pathJava && detectJavaMajor(pathJava) === major) return pathJava;
  if (process.env.JAVA_HOME) {
    const envHome = path.join(process.env.JAVA_HOME, 'bin', JAVA_BIN);
    if (await fs.pathExists(envHome) && detectJavaMajor(envHome) === major) return envHome;
  }
  const found = await findJavaMatchingMajor(javaSearchBases(), major);
  if (found) return found;
  const zulu = await ensureZuluJava(major);
  if (zulu && detectJavaMajor(zulu) === major) return zulu;
  const temurin = await ensureTemurinJava(major);
  if (temurin && detectJavaMajor(temurin) === major) return temurin;
  return await ensureMicrosoftJava(major);
}
async function resolveValidMinecraftVersion(input: string): Promise<string> {
  const candidate = String(input || '').trim();
  try {
    const manifest = await getVersionManifest();
    const versions = Array.isArray(manifest?.versions) ? manifest.versions : [];
    const latestRelease = manifest?.latest?.release || versions.find((v: any) => v.type === 'release')?.id || '';
    if (!candidate) return latestRelease || '1.21.1';
    if (versions.find((v: any) => v.id === candidate)) return candidate;
    const m = candidate.match(/(\d+\.\d+(?:\.\d+)?)/);
    const prefix = m ? m[1] : candidate;
    const exactByPrefix = versions.find((v: any) => v.id === prefix);
    if (exactByPrefix) return exactByPrefix.id;
    const byPrefix = versions.find((v: any) => v.type === 'release' && v.id.startsWith(prefix));
    if (byPrefix) return byPrefix.id;
    return latestRelease || candidate;
  } catch {}
  return candidate || '1.21.1';
}
async function ensureFabricProfile(mcVersion: string): Promise<string | null> {
  try {
    const v = await resolveValidMinecraftVersion(mcVersion);
    const loaders = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(v)}`, { timeout: 20000 });
    const list = Array.isArray(loaders.data) ? loaders.data : [];
    const first = list.find((x: any) => x?.loader?.stable) || list[0] || null;
    if (!first || !first.loader) return null;
    const loaderVer = first.loader.version;
    const profileRes = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(v)}/${loaderVer}/profile/json`, { timeout: 20000 });
    const profile = profileRes.data;
    const id = profile?.id;
    if (!id) return null;
    const verDir = path.join(MINECRAFT_ROOT, 'versions', id);
    await fs.ensureDir(verDir);
    await fs.writeJson(path.join(verDir, `${id}.json`), profile, { spaces: 2 });
    return id;
  } catch {
    return null;
  }
}
async function ensureQuiltProfile(mcVersion: string): Promise<string | null> {
  try {
    const v = await resolveValidMinecraftVersion(mcVersion);
    const loaders = await axios.get(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(v)}`, { timeout: 20000 });
    const list = Array.isArray(loaders.data) ? loaders.data : [];
    const first = list[0] || null;
    if (!first || !first.loader) return null;
    const loaderVer = first.loader.version;
    const profileRes = await axios.get(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(v)}/${loaderVer}/profile/json`, { timeout: 20000 });
    const profile = profileRes.data;
    const id = profile?.id;
    if (!id) return null;
    const verDir = path.join(MINECRAFT_ROOT, 'versions', id);
    await fs.ensureDir(verDir);
    await fs.writeJson(path.join(verDir, `${id}.json`), profile, { spaces: 2 });
    return id;
  } catch {
    return null;
  }
}
function compareVersionStrings(a: string, b: string): number {
  const pa = String(a).split(/[.\-+]/);
  const pb = String(b).split(/[.\-+]/);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const sa = pa[i] || '';
    const sb = pb[i] || '';
    const na = parseInt(sa, 10);
    const nb = parseInt(sb, 10);
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      const c = sa.localeCompare(sb);
      if (c !== 0) return c;
    }
  }
  return 0;
}
async function fetchMavenVersions(metaUrl: string): Promise<string[]> {
  try {
    const res = await axios.get(metaUrl, { timeout: 25000, headers: { 'User-Agent': 'aiom-launcher' } });
    const xml = String(res.data || '');
    return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
  } catch {
    return [];
  }
}
async function ensureLauncherProfiles() {
  try {
    const p = path.join(MINECRAFT_ROOT, 'launcher_profiles.json');
    if (!(await fs.pathExists(p))) {
      await fs.writeJson(p, { profiles: {}, settings: {}, version: 3 }, { spaces: 2 });
    }
  } catch {}
}
async function resolveForgeVersion(v: string): Promise<string | null> {
  try {
    const res = await axios.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', {
      timeout: 20000,
      headers: { 'User-Agent': 'aiom-launcher' }
    });
    const promos = res.data?.promos || {};
    const recommended = promos[`${v}-recommended`];
    const latest = promos[`${v}-latest`];
    if (recommended || latest) return String(recommended || latest);
  } catch {}
  try {
    const all = await fetchMavenVersions('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
    const matches = all.filter(x => x === v || x.startsWith(`${v}-`));
    if (matches.length) {
      matches.sort(compareVersionStrings);
      return matches[matches.length - 1];
    }
  } catch {}
  return null;
}
async function ensureForgeProfile(mcVersion: string): Promise<string | null> {
  try {
    const v = await resolveValidMinecraftVersion(mcVersion);
    const fv = await resolveForgeVersion(v);
    if (!fv) return null;
    const coord = fv.startsWith(`${v}-`) ? fv : `${v}-${fv}`;
    const jarUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${coord}/forge-${coord}-installer.jar`;
    const tmpDir = path.join(APP_DATA_PATH, 'forge');
    await fs.ensureDir(tmpDir);
    const jarPath = path.join(tmpDir, `forge-${coord}-installer.jar`);
    if (!(await downloadFile(jarUrl, jarPath))) return null;
    const java = await ensureJavaPath(v);
    if (!java) return null;
    await ensureLauncherProfiles();
    try {
      execFileSync(java, ['-jar', jarPath, '--installClient', MINECRAFT_ROOT], { stdio: 'pipe', timeout: 10 * 60 * 1000 });
    } catch {
      return null;
    }
    const versionsDir = path.join(MINECRAFT_ROOT, 'versions');
    const entries = await fs.pathExists(versionsDir) ? await fs.readdir(versionsDir) : [];
    for (const e of entries) {
      const p = path.join(versionsDir, e, `${e}.json`);
      if (await fs.pathExists(p)) {
        try {
          const j = await fs.readJson(p);
          const id = String(j.id || '');
          const inherits = String(j.inheritsFrom || '');
          if (id.toLowerCase().includes('forge') && !id.toLowerCase().includes('neoforge') && inherits === v) return id;
        } catch {}
      }
    }
    return null;
  } catch {
    return null;
  }
}
async function ensureNeoForgeProfile(mcVersion: string): Promise<string | null> {
  try {
    const v = await resolveValidMinecraftVersion(mcVersion);
    const versions = await fetchMavenVersions('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
    if (versions.length === 0) return null;
    const parts = v.split('.');
    const major = parseInt(parts[0] || '0', 10);
    const minor = parseInt(parts[1] || '0', 10);
    const patch = parseInt(parts[2] || '0', 10);
    const prefix = major === 1 ? `${minor}.${patch}.` : `${major}.${minor}.`;
    let candidates = versions.filter(ver => ver.startsWith(prefix));
    if (candidates.length === 0) candidates = versions.filter(ver => ver.startsWith(`${v}-`) || ver.includes(v));
    if (candidates.length === 0) return null;
    candidates.sort(compareVersionStrings);
    const selected = candidates[candidates.length - 1];
    const jarUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${selected}/neoforge-${selected}-installer.jar`;
    const tmpDir = path.join(APP_DATA_PATH, 'neoforge');
    await fs.ensureDir(tmpDir);
    const jarPath = path.join(tmpDir, `neoforge-${selected}-installer.jar`);
    if (!(await downloadFile(jarUrl, jarPath))) return null;
    const java = await ensureJavaPath(v);
    if (!java) return null;
    await ensureLauncherProfiles();
    try {
      execFileSync(java, ['-jar', jarPath, '--installClient', MINECRAFT_ROOT], { stdio: 'pipe', timeout: 10 * 60 * 1000 });
    } catch {
      return null;
    }
    const versionsDir = path.join(MINECRAFT_ROOT, 'versions');
    const entries = await fs.pathExists(versionsDir) ? await fs.readdir(versionsDir) : [];
    let best: { id: string; time: number } | null = null;
    for (const e of entries) {
      const p = path.join(versionsDir, e, `${e}.json`);
      if (await fs.pathExists(p)) {
        try {
          const j = await fs.readJson(p);
          const id = String(j.id || '');
          const inherits = String(j.inheritsFrom || '');
          if (id.toLowerCase().includes('neoforge') && inherits === v) {
            const time = Date.parse(String(j.time || j.releaseTime || '')) || 0;
            if (!best || time > best.time) best = { id, time };
          }
        } catch {}
      }
    }
    return best ? best.id : null;
  } catch {
    return null;
  }
}
async function ensureLoaderSplash(packPath: string, mcVersion: string, iconPath?: string) {
  try {
    const cfg = await getGlobalOptions();
    const bundledA = path.join(__dirname, '../Loadericon.png');
    const bundledB = path.join(__dirname, 'Loadericon.png');
    const src = iconPath
      || cfg.loaderSplashIcon
      || (await fs.pathExists(bundledA) ? bundledA : (await fs.pathExists(bundledB) ? bundledB : null));
    if (!src || !(await fs.pathExists(src))) return;
    const appIconDir = path.join(APP_DATA_PATH, 'assets');
    await fs.ensureDir(appIconDir);
    const appIconPath = path.join(appIconDir, 'loadericon.png');
    try {
      await fs.copy(src, appIconPath);
      const newCfg = { ...cfg, loaderSplashIcon: appIconPath };
      await fs.writeJson(GLOBAL_CONFIG_FILE, newCfg, { spaces: 2 });
    } catch {}
    const rpDir = path.join(packPath, 'resourcepacks', 'aiom-loader-overlay');
    const texDir = path.join(rpDir, 'assets', 'minecraft', 'textures', 'gui', 'title');
    await fs.ensureDir(texDir);
    const packMeta = {
      pack: {
        pack_format: 48,
        description: 'AIOM loader overlay',
        supported_formats: { min_inclusive: 4, max_inclusive: 999 }
      }
    };
    await fs.writeJson(path.join(rpDir, 'pack.mcmeta'), packMeta, { spaces: 2 });
    const targetPng = path.join(texDir, 'mojangstudios.png');
    async function getAssetsIndexId(verId: string): Promise<string | null> {
      try {
        const verJsonPath = path.join(MINECRAFT_ROOT, 'versions', verId, `${verId}.json`);
        if (!(await fs.pathExists(verJsonPath))) return null;
        const j = await fs.readJson(verJsonPath);
        if (j.assets) return String(j.assets);
        if (j.assetIndex && j.assetIndex.id) return String(j.assetIndex.id);
        const parent = String(j.inheritsFrom || '');
        if (parent) {
          const pj = await fs.readJson(path.join(MINECRAFT_ROOT, 'versions', parent, `${parent}.json`)).catch(() => null);
          if (pj) {
            if (pj.assets) return String(pj.assets);
            if (pj.assetIndex && pj.assetIndex.id) return String(pj.assetIndex.id);
          }
        }
      } catch {}
      return null;
    }
    async function getMojangStudiosPath(assetsId: string): Promise<string | null> {
      try {
        const idxPath = path.join(MINECRAFT_ROOT, 'assets', 'indexes', `${assetsId}.json`);
        if (!(await fs.pathExists(idxPath))) return null;
        const idx = await fs.readJson(idxPath);
        const obj = idx.objects?.['minecraft/textures/gui/title/mojangstudios.png'];
        const hash = obj?.hash;
        if (!hash) return null;
        const pfx = hash.substring(0, 2);
        const objPath = path.join(MINECRAFT_ROOT, 'assets', 'objects', pfx, hash);
        if (await fs.pathExists(objPath)) return objPath;
        const url = `https://resources.download.minecraft.net/${pfx}/${hash}`;
        const buf = await axios.get(url, { responseType: 'arraybuffer' }).then(r => r.data).catch(() => null);
        if (!buf) return null;
        await fs.ensureDir(path.dirname(objPath));
        await fs.writeFile(objPath, buf);
        return objPath;
      } catch {}
      return null;
    }
    let composed = false;
    try {
      const verId = mcVersion;
      const assetsId = await getAssetsIndexId(verId);
      const basePath = assetsId ? await getMojangStudiosPath(assetsId) : null;
      if (basePath) {
        const baseImg = await Jimp.read(await fs.readFile(basePath));
        const iconImg = await Jimp.read(await fs.readFile(appIconPath));
        const targetWidth = Math.round(baseImg.getWidth() * 0.4);
        iconImg.scaleToFit(targetWidth, targetWidth);
        const x = Math.round((baseImg.getWidth() - iconImg.getWidth()) / 2);
        const y = Math.round(baseImg.getHeight() * 0.08);
        baseImg.composite(iconImg, x, y, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 1, opacityDest: 1 });
        await fs.ensureDir(texDir);
        await baseImg.writeAsync(targetPng);
        composed = true;
      }
    } catch {}
    if (!composed) {
      await fs.copy(appIconPath, targetPng);
    }
    const optPath = path.join(packPath, 'options.txt');
    let lines: string[] = [];
    if (await fs.pathExists(optPath)) {
      const content = await fs.readFile(optPath, 'utf-8');
      lines = content.split(/\r?\n/);
    }
    let found = false;
    lines = lines.map((ln) => {
      if (/^\s*resourcePacks\s*:/i.test(ln)) {
        found = true;
        const m = ln.match(/^\s*resourcePacks\s*:\s*(\[.*\])\s*$/i);
        let arr: string[] = [];
        if (m) {
          try { arr = JSON.parse(m[1]); } catch {}
        }
        if (!Array.isArray(arr)) arr = [];
        if (!arr.includes('file/aiom-loader-overlay')) arr.push('file/aiom-loader-overlay');
        return `resourcePacks:${JSON.stringify(arr)}`;
      }
      return ln;
    });
    if (!found) {
      lines.push(`resourcePacks:${JSON.stringify(['file/aiom-loader-overlay'])}`);
    }
    await fs.writeFile(optPath, lines.join('\n'), 'utf-8');
  } catch {}
}

function getPackFormat(ver: string): number {
  const v = String(ver || '').split('.');
  const major = parseInt(v[0] || '0', 10);
  const minor = parseInt(v[1] || '0', 10);
  const patch = parseInt(v[2] || '0', 10);

  if (major === 1) {
    if (minor >= 21) {
      if (minor === 21) {
        if (patch >= 9) return 64;
        if (patch >= 6) return 63;
        if (patch >= 5) return 55;
        if (patch >= 4) return 46;
        if (patch >= 2) return 42;
        return 34; // 1.21 / 1.21.1
      }
      return 69;
    }
    if (minor === 20) {
      if (patch >= 5) return 32; // 1.20.5+
      if (patch >= 3) return 22; // 1.20.3-4
      if (patch === 2) return 18; // 1.20.2
      return 15; // 1.20-1.20.1
    }
    if (minor === 19) {
      if (patch === 4) return 13;
      if (patch === 3) return 12;
      return 9;
    }
    if (minor === 18) {
        if (patch === 2) return 9;
        return 8;
    }
    if (minor === 17) return 7;
    if (minor === 16) return 6; // 1.16.2-5 is 6, 1.16-1.16.1 is 5. Simplified to 6.
    if (minor === 15) return 5;
    if (minor === 14) return 4;
    if (minor === 13) return 4;
    if (minor >= 11) return 3;
    if (minor >= 9) return 2;
    return 1;
  }
  // Calendar-style versioning (26.x+): resource pack format 69+
  if (major >= 26) return 69;
  return 15; // Default fallback
}

async function ensureAccountSkinOverlay(packPath: string, skinPngPath?: string, mcVersion?: string) {
  try {
    const skinsDir = path.join(APP_DATA_PATH, 'skins');
    await fs.ensureDir(skinsDir);
    const src = skinPngPath && await fs.pathExists(skinPngPath) ? skinPngPath : null;
    if (!src) return;
    const rpDir = path.join(packPath, 'resourcepacks', 'aiom-skin-overlay');
    const texDir = path.join(rpDir, 'assets', 'minecraft', 'textures', 'entity');
    await fs.ensureDir(texDir);
    
    const fmt = getPackFormat(mcVersion || '');
    const packMeta = {
      pack: {
        pack_format: fmt,
        description: 'AIOM account skin overlay',
        supported_formats: { min_inclusive: 4, max_inclusive: 999 }
      }
    };
    await fs.writeJson(path.join(rpDir, 'pack.mcmeta'), packMeta, { spaces: 2 });
    await fs.copy(src, path.join(texDir, 'steve.png'));
    await fs.copy(src, path.join(texDir, 'alex.png'));

    // Update options to use the folder instead of zip
    const optPath = path.join(packPath, 'options.txt');
    let lines: string[] = [];
    if (await fs.pathExists(optPath)) {
      const content = await fs.readFile(optPath, 'utf-8');
      lines = content.split(/\r?\n/);
    }
    let found = false;
    lines = lines.map((ln) => {
      if (/^\s*resourcePacks\s*:/i.test(ln)) {
        found = true;
        const m = ln.match(/^\s*resourcePacks\s*:\s*(\[.*\])\s*$/i);
        let arr: string[] = [];
        if (m) {
          try { arr = JSON.parse(m[1]); } catch {}
        }
        if (!Array.isArray(arr)) arr = [];
        // Ensure overlay at the front so it overrides others
        arr = arr.filter((x) => x !== 'file/aiom-skin-overlay' && x !== 'file/aiom-skin-overlay.zip');
        arr.unshift('file/aiom-skin-overlay');
        return `resourcePacks:${JSON.stringify(arr)}`;
      }
      return ln;
    });
    if (!found) {
      lines.push(`resourcePacks:${JSON.stringify(['file/aiom-skin-overlay'])}`);
    }
    // Also force lastServer to be empty to prevent quick play conflicts? No, keep it.
    await fs.writeFile(optPath, lines.join('\n'), 'utf-8');
    
    // Remove the zip version if it exists to avoid confusion
    const zipPath = path.join(packPath, 'resourcepacks', 'aiom-skin-overlay.zip');
    if (await fs.pathExists(zipPath)) {
      await fs.remove(zipPath);
    }
   } catch (e) {
     console.error('Error ensuring skin overlay:', e);
   }
}
// Explicitly defined paths per user requirement
async function ensureCustomSkinLoader(packPath: string, accountName: string, mcVersionHint?: string, loaderHint?: string, skinPngPath?: string) {
  try {
    const metaPath = path.join(packPath, 'meta.json');
    let loader = String(loaderHint || '').toLowerCase();
    let mcVersion = String(mcVersionHint || '');
    if (await fs.pathExists(metaPath)) {
      const meta = await fs.readJson(metaPath).catch(() => ({}));
      if (!loader) loader = String(meta.loader || '').toLowerCase();
      if (!mcVersion || mcVersion === 'unknown') mcVersion = String(meta.version || '');
    }
    loader = (loader === 'kingmodloader' || loader.includes('kingmodloader')) ? 'forge' : loader;
    mcVersion = await resolveValidMinecraftVersion(mcVersion || '1.20.1');
    if (!['fabric', 'quilt', 'forge', 'neoforge'].includes(loader)) return;
    const modsDir = path.join(packPath, 'mods');
    await fs.ensureDir(modsDir);
    // Fetch CustomSkinLoader from Modrinth
    const projRes = await axios.get('https://api.modrinth.com/v2/project/customskinloader').catch(() => null);
    const projectId = projRes?.data?.id;
    if (!projectId) return;
    let versionsRes = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`, {
      params: {
        loaders: JSON.stringify([loader]),
        game_versions: JSON.stringify([mcVersion])
      }
    }).catch(() => null);
    let versions = versionsRes?.data || [];
    if (!Array.isArray(versions) || versions.length === 0) {
      versionsRes = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`).catch(() => null);
      versions = versionsRes?.data || [];
      if (!Array.isArray(versions) || versions.length === 0) return;
    }
    const targetVersion = versions[0];
    const file = targetVersion.files?.find((f: any) => f.primary) || targetVersion.files?.[0];
    if (!file || !file.url || !file.filename) return;
    const jarPath = path.join(modsDir, file.filename);
    if (!(await fs.pathExists(jarPath))) {
      const resp = await axios.get(file.url, { responseType: 'stream' }).catch(() => null);
      if (resp?.data) {
        await new Promise<void>((resolve, reject) => {
          const w = fs.createWriteStream(jarPath);
          resp.data.pipe(w);
          w.on('finish', () => resolve());
          w.on('error', reject);
        });
      }
    }
    // Write CustomSkinLoader config and local skin
    const cslRoot = path.join(packPath, 'CustomSkinLoader');
    const skinsDir = path.join(cslRoot, 'skins');
    await fs.ensureDir(skinsDir);
    if (skinPngPath && await fs.pathExists(skinPngPath)) {
      const destExact = `${accountName}.png`;
      const destLower = `${String(accountName).toLowerCase()}.png`;
      await fs.copy(skinPngPath, path.join(skinsDir, destExact), { overwrite: true });
      await fs.copy(skinPngPath, path.join(skinsDir, destLower), { overwrite: true });
    }
    const configDir = path.join(packPath, 'config', 'CustomSkinLoader');
    await fs.ensureDir(configDir);
    const configPath = path.join(configDir, 'CustomSkinLoader.json');
    const config = {
      enableLocalProfile: true,
      enableLocalSkin: true,
      enableLocalCape: false,
      root: "CustomSkinLoader",
      loadlist: [
        { name: "Local", type: "Local", skins: "skins", capes: "capes" },
        { name: "Mojang", type: "Mojang" }
      ],
      components: { mergeExternals: false },
      cache: { enable: true }
    } as any;
    await fs.writeJson(configPath, config, { spaces: 2 });
  } catch {}
}
// Explicitly defined paths per user requirement
const APP_DATA_PATH = path.join(app.getPath('appData'), 'aiom');
const MOD_PACKS_PATH = path.join(APP_DATA_PATH, 'Mod packs');
const TUTORIAL_FILE = path.join(APP_DATA_PATH, 'is_tutorial_done');
const GLOBAL_CONFIG_FILE = path.join(APP_DATA_PATH, 'global_options.json');
const MINECRAFT_ROOT = path.join(APP_DATA_PATH, '.minecraft');

// Ensure directories exist
fs.ensureDirSync(MOD_PACKS_PATH);
fs.ensureDirSync(MINECRAFT_ROOT);

// Discord RPC
const clientId = '1465001913820119122';
let rpcClient: DiscordRPC.Client | null = null;
const appStartTime = Date.now();
let isLaunching = false;

async function initDiscordRPC() {
  try {
    rpcClient = new DiscordRPC.Client({ transport: 'ipc' });
    rpcClient.on('ready', () => {
      console.log('Discord RPC Ready');
      setDiscordActivity('Browsing Mods');
    });
    await rpcClient.login({ clientId }).catch(console.error);
  } catch (e) {
    console.error('Failed to connect to Discord RPC', e);
  }
}

function setDiscordActivity(details: string, state?: string) {
  if (!rpcClient) return;
  rpcClient.setActivity({
    details,
    state,
    largeImageKey: 'aiom_logo', // Optimistic guess, can be removed if broken
    largeImageText: 'All in One Mods',
    startTimestamp: appStartTime,
    instance: false,
  }).catch(() => {}); // Ignore errors if RPC disconnects
}

const runningProcesses = new Map<string, any>();
const processLogs = new Map<string, string[]>();
let processCounter = 0;

function broadcastProcesses() {
  const procs = Array.from(runningProcesses.values()).map((p: any) => ({
    id: p.id,
    packName: p.packName,
    status: p.status,
    pid: p.pid,
    startedAt: p.startedAt,
    logs: (processLogs.get(p.id) || []).slice(-200)
  }));
  if (mainWindow) mainWindow.webContents.send('running-processes', procs);
}

launcher.on('close', () => {
  setDiscordActivity('Browsing Mods');
  for (const [id, proc] of runningProcesses.entries()) {
    if (proc.status === 'running' || proc.status === 'launching') {
      proc.status = 'closed';
      processLogs.set(id, [...(processLogs.get(id) || []), '[Process closed]']);
      broadcastProcesses();
      runningProcesses.delete(id);
    }
  }
  if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'closed' });
  isLaunching = false;
});

launcher.on('debug', (e) => {
  const msg = String(e);
  console.log(`[Launcher Debug] ${msg}`);
  for (const [id, proc] of runningProcesses.entries()) {
    if (proc.status === 'launching' || proc.status === 'running') {
      const arr = processLogs.get(id) || [];
      arr.push(`[debug] ${msg}`);
      processLogs.set(id, arr.slice(-500));
      broadcastProcesses();
    }
  }
  if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: msg });
});
launcher.on('data', (e) => {
  const msg = String(e);
  console.log(`[Minecraft Stdout] ${msg}`);
  for (const [id, proc] of runningProcesses.entries()) {
    if (proc.status === 'launching' || proc.status === 'running') {
      const arr = processLogs.get(id) || [];
      arr.push(msg);
      processLogs.set(id, arr.slice(-500));
      broadcastProcesses();
    }
  }
  if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'data', message: msg });
});
launcher.on('error', (e) => {
  const msg = String(e || '');
  console.error('[Launcher Error]', msg);
  let friendly = msg;
  let code = 'unknown';
  if (/invalid session/i.test(msg) || /failed to verify username/i.test(msg)) {
    code = 'invalid_session';
    friendly = 'Invalid session. Online-mode servers require a Microsoft login.';
  } else if (/user authentication/i.test(msg) || /auth/i.test(msg)) {
    code = 'auth_failed';
    friendly = 'Authentication failed. Please sign in with Microsoft again.';
  }
  for (const [id, proc] of runningProcesses.entries()) {
    if (proc.status === 'launching' || proc.status === 'running') {
      const arr = processLogs.get(id) || [];
      arr.push(`[error] ${friendly}`);
      processLogs.set(id, arr.slice(-500));
      proc.status = 'failed';
      broadcastProcesses();
    }
  }
  if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'failed', error: friendly, code });
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: true, 
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allow loading local resources (file://) in dev mode
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../icon.png')
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  initDiscordRPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Helper Functions ---

async function getGlobalOptions() {
  try {
    if (await fs.pathExists(GLOBAL_CONFIG_FILE)) {
      return await fs.readJson(GLOBAL_CONFIG_FILE);
    }
    return {};
  } catch (e) {
    return {};
  }
}

async function detectPackInfo(packPath: string, currentMeta: any) {
  let updated = false;
  const newMeta = { ...currentMeta };

  const shouldUpdate = (key: string, value: string) => {
    if (!value) return false;
    if (!newMeta[key] || newMeta[key] === 'unknown') {
        newMeta[key] = value;
        updated = true;
        return true;
    }
    return false;
  };

  try {
    // 1. Check manifest.json (CurseForge)
    const manifestPath = path.join(packPath, 'manifest.json');
    if (await fs.pathExists(manifestPath)) {
        const manifest = await fs.readJson(manifestPath);
        if (manifest.minecraft) {
            shouldUpdate('version', manifest.minecraft.version);
            if (manifest.minecraft.modLoaders && manifest.minecraft.modLoaders.length > 0) {
                 const loaderId = manifest.minecraft.modLoaders[0].id;
                 if (loaderId.includes('fabric')) shouldUpdate('loader', 'fabric');
                 else if (loaderId.includes('forge')) shouldUpdate('loader', 'forge');
                 else if (loaderId.includes('neoforge')) shouldUpdate('loader', 'neoforge');
                 else if (loaderId.includes('quilt')) shouldUpdate('loader', 'quilt');
                 else shouldUpdate('loader', loaderId);
            }
        }
    }

    // 2. Check modrinth.index.json (Modrinth)
    const modrinthPath = path.join(packPath, 'modrinth.index.json');
    if (await fs.pathExists(modrinthPath)) {
        const index = await fs.readJson(modrinthPath);
        if (index.dependencies) {
             shouldUpdate('version', index.dependencies.minecraft);
             if (index.dependencies['fabric-loader']) shouldUpdate('loader', 'fabric');
             if (index.dependencies['forge']) shouldUpdate('loader', 'forge');
             if (index.dependencies['neoforge']) shouldUpdate('loader', 'neoforge');
             if (index.dependencies['quilt-loader']) shouldUpdate('loader', 'quilt');
        }
    }
    
    // 3. Check mmc-pack.json (MultiMC)
    const mmcPath = path.join(packPath, 'mmc-pack.json');
    if (await fs.pathExists(mmcPath)) {
         const mmc = await fs.readJson(mmcPath);
         if (mmc.components) {
             const mcComp = mmc.components.find((c: any) => c.uid === 'net.minecraft');
             if (mcComp) shouldUpdate('version', mcComp.version);
             
             const fabricComp = mmc.components.find((c: any) => c.uid === 'net.fabricmc.fabric-loader');
             if (fabricComp) shouldUpdate('loader', 'fabric');
             
             const forgeComp = mmc.components.find((c: any) => c.uid === 'net.minecraftforge');
             if (forgeComp) shouldUpdate('loader', 'forge');
         }
    }

    if (updated) {
        await fs.writeJson(path.join(packPath, 'meta.json'), newMeta, { spaces: 2 });
    }
  } catch (e) {
      console.error('Error detecting pack info:', e);
  }
  
  return newMeta;
}

// --- IPC Handlers ---

ipcMain.handle('get-mod-packs', async () => {
  try {
    const packs = await fs.readdir(MOD_PACKS_PATH);
    const validPacks = [];
    for (const pack of packs) {
      const packPath = path.join(MOD_PACKS_PATH, pack);
      const stat = await fs.stat(packPath);
      if (stat.isDirectory()) {
        const metaPath = path.join(packPath, 'meta.json');
        let meta: any = { name: pack, loader: 'unknown', version: 'unknown' };
        if (await fs.pathExists(metaPath)) {
          meta = await fs.readJson(metaPath);
        }
        
        // Auto-detect if unknown
        if (!meta.loader || meta.loader === 'unknown' || !meta.version || meta.version === 'unknown') {
            meta = await detectPackInfo(packPath, meta);
        }

        validPacks.push(meta);
      }
    }
    return validPacks;
  } catch (error) {
    console.error('Error reading mod packs:', error);
    return [];
  }
});

ipcMain.handle('delete-mod-pack', async (_, packName) => {
  try {
    const packPath = path.join(MOD_PACKS_PATH, packName);
    if (!await fs.pathExists(packPath)) {
      return { success: false, error: 'Pack not found' };
    }
    await fs.remove(packPath);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting mod pack:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-mod-pack', async (_, name, loader, version, githubRepo) => {
  try {
    const packPath = path.join(MOD_PACKS_PATH, name);
    if (await fs.pathExists(packPath)) {
      throw new Error('Mod pack already exists');
    }
    await fs.ensureDir(packPath);

    if (loader === 'Custom (GitHub)' && githubRepo) {
      try {
        const [owner, repo] = githubRepo.split('/');
        if (!owner || !repo) throw new Error('Invalid repository format (owner/repo)');

        // Download zipball
        const url = `https://api.github.com/repos/${owner}/${repo}/zipball`;
        const zipPath = path.join(packPath, 'repo.zip');
        
        console.log(`Downloading GitHub repo: ${url}`);
        const response = await axios({
            method: 'get',
            url,
            responseType: 'arraybuffer'
        });
        
        await fs.writeFile(zipPath, response.data);

        // Extract
        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries();
        if (entries.length === 0) throw new Error('Empty repository');
        
        // GitHub zipballs usually have a root folder like 'user-repo-sha'
        const rootFolder = entries[0].entryName.split('/')[0];
        
        zip.extractAllTo(packPath, true);
        
        // Move files up from the root folder
        const extractedRoot = path.join(packPath, rootFolder);
        if (await fs.pathExists(extractedRoot)) {
            const files = await fs.readdir(extractedRoot);
            for (const file of files) {
                await fs.move(path.join(extractedRoot, file), path.join(packPath, file), { overwrite: true });
            }
            await fs.remove(extractedRoot);
        }
        
        await fs.remove(zipPath);
      } catch (e: any) {
         // Clean up partially created pack
         await fs.remove(packPath);
         throw new Error(`GitHub download failed: ${e.message}`);
      }
    }
    
    // Create standard folders (idempotent)
    await fs.ensureDir(path.join(packPath, 'mods'));
    await fs.ensureDir(path.join(packPath, 'saves')); // Worlds
    await fs.ensureDir(path.join(packPath, 'resourcepacks'));
    await fs.ensureDir(path.join(packPath, 'shaderpacks'));
    
    // Create meta file
    const meta = {
      name,
      loader,
      version,
      created: new Date().toISOString()
    };
    await fs.writeJson(path.join(packPath, 'meta.json'), meta, { spaces: 2 });
    
    // Apply Global Config (options.txt)
    const globalOptions = await getGlobalOptions();
    if (Object.keys(globalOptions).length > 0) {
      // Convert JSON to options.txt format
      const optionsContent = Object.entries(globalOptions)
        .map(([key, value]) => `${key}:${value}`)
        .join('\n');
    
      await fs.writeFile(path.join(packPath, 'options.txt'), optionsContent);
    }
    
    return { success: true, meta };
  } catch (error: any) {
    console.error('Error creating mod pack:', error);
    return { success: false, error: error.message };
  }
});

// --- NBT Editor & Import ---

ipcMain.handle('get-all-worlds', async () => {
  const worlds: any[] = [];
  try {
    const packs = await fs.readdir(MOD_PACKS_PATH);
    for (const pack of packs) {
      const packPath = path.join(MOD_PACKS_PATH, pack);
      const savesPath = path.join(packPath, 'saves');
      
      if (await fs.pathExists(savesPath)) {
        const saves = await fs.readdir(savesPath);
        for (const save of saves) {
          const savePath = path.join(savesPath, save);
          const levelDatPath = path.join(savePath, 'level.dat');
          
          if (await fs.pathExists(levelDatPath)) {
            // Basic info from folder name initially
            // Reading NBT here might be slow if many worlds, but we'll try to read name
            let worldName = save;
            try {
               const buffer = await fs.readFile(levelDatPath);
               const parsed = await parseNbt(buffer);
               const data = (parsed as any).value.Data || (parsed as any).value;
               if (data && data.value && data.value.LevelName) {
                 worldName = data.value.LevelName.value;
               }
            } catch (e) {
              // Ignore NBT parse error for listing
            }

            worlds.push({
              packName: pack,
              folderName: save,
              name: worldName,
              path: savePath
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('Error scanning worlds:', e);
  }
  return worlds;
});

ipcMain.handle('read-level-dat', async (_, packName, worldFolder) => {
  try {
    const levelDatPath = path.join(MOD_PACKS_PATH, packName, 'saves', worldFolder, 'level.dat');
    const buffer = await fs.readFile(levelDatPath);
    const parsed = await parseNbt(buffer);
    return nbt.simplify(parsed); // Simplify for easier frontend editing
  } catch (error: any) {
    console.error('Error reading level.dat:', error);
    return null;
  }
});

ipcMain.handle('save-level-dat', async (_, packName, worldFolder, data) => {
  try {
    const levelDatPath = path.join(MOD_PACKS_PATH, packName, 'saves', worldFolder, 'level.dat');
    
    // We need to re-construct the NBT structure. 
    // Since nbt.simplify removes type info, writing back is tricky without a schema.
    // For this prototype, we will read the ORIGINAL file again, update specific fields, and write back.
    
    const buffer = await fs.readFile(levelDatPath);
    const parsed = await parseNbt(buffer);
    
    // Helper to update specific fields safely
    const root = (parsed as any).value.Data ? (parsed as any).value.Data.value : (parsed as any).value;
    
    if (data.LevelName && root.LevelName) root.LevelName.value = data.LevelName;
    if (data.RandomSeed && root.RandomSeed) root.RandomSeed.value = BigInt(data.RandomSeed); // Handle BigInt if needed
    if (data.Time && root.Time) root.Time.value = BigInt(data.Time);
    if (data.GameType !== undefined && root.GameType) root.GameType.value = parseInt(data.GameType);
    
    // Re-encode
    const newBuffer = nbt.writeUncompressed(parsed);
    const compressed = await gzip(newBuffer);
    
    await fs.writeFile(levelDatPath, compressed);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving level.dat:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-instance', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Select Instance Folder',
      properties: ['openDirectory']
    });

    if (filePaths && filePaths.length > 0) {
      const sourcePath = filePaths[0];
      const folderName = path.basename(sourcePath);
      const destPath = path.join(MOD_PACKS_PATH, folderName);

      if (await fs.pathExists(destPath)) {
        return { success: false, error: 'A mod pack with this name already exists.' };
      }

      await fs.copy(sourcePath, destPath);

      // Create meta.json if not exists
      const metaPath = path.join(destPath, 'meta.json');
      if (!await fs.pathExists(metaPath)) {
        await fs.writeJson(metaPath, {
          name: folderName,
          loader: 'unknown',
          version: 'unknown',
          created: new Date().toISOString(),
          imported: true
        }, { spaces: 2 });
      }

      return { success: true };
    }
    return { success: false, error: 'Cancelled' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-aiom-pack', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Select AIOM Pack File',
      properties: ['openFile'],
      filters: [{ name: 'AIOM Pack', extensions: ['aiompack', 'zip'] }]
    });
    if (!filePaths || filePaths.length === 0) return { success: false, error: 'Cancelled' };
    const packFile = filePaths[0];
    const tempDir = path.join(APP_DATA_PATH, 'temp_aiompack');
    await fs.ensureDir(tempDir);
    try {
      const zip = new AdmZip(packFile);
      zip.extractAllTo(tempDir, true);
    } catch (e: any) {
      return { success: false, error: 'Failed to extract AIOM pack: ' + e.message };
    }
    let packName = path.basename(packFile, path.extname(packFile));
    let meta: any = null;
    // Try to find meta.json anywhere in extracted content
    async function findMeta(dir: string): Promise<string | null> {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          const nested = await findMeta(full);
          if (nested) return nested;
        } else if (entry.toLowerCase() === 'meta.json') {
          return full;
        }
      }
      return null;
    }
    const metaPath = await findMeta(tempDir);
    if (metaPath) {
      try {
        meta = await fs.readJson(metaPath);
        if (meta?.name) packName = meta.name;
      } catch {}
    }
    const destPath = path.join(MOD_PACKS_PATH, packName);
    if (await fs.pathExists(destPath)) {
      await fs.remove(destPath);
    }
    await fs.ensureDir(destPath);
    // Move all extracted content into dest
    const items = await fs.readdir(tempDir);
    for (const it of items) {
      await fs.move(path.join(tempDir, it), path.join(destPath, it), { overwrite: true });
    }
    // Ensure standard folders
    await fs.ensureDir(path.join(destPath, 'mods'));
    await fs.ensureDir(path.join(destPath, 'saves'));
    await fs.ensureDir(path.join(destPath, 'resourcepacks'));
    await fs.ensureDir(path.join(destPath, 'shaderpacks'));
    // Write meta if missing
    const destMeta = path.join(destPath, 'meta.json');
    if (!await fs.pathExists(destMeta)) {
      await fs.writeJson(destMeta, {
        name: packName,
        loader: meta?.loader || 'unknown',
        version: meta?.version || 'unknown',
        created: new Date().toISOString(),
        imported: true,
        source: packFile
      }, { spaces: 2 });
    }
    // Clean temp
    await fs.remove(tempDir);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('check-tutorial', async () => {
  try {
    if (await fs.pathExists(TUTORIAL_FILE)) {
      const content = await fs.readFile(TUTORIAL_FILE, 'utf-8');
      return content.trim() === 'true';
    }
    return false;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('complete-tutorial', async () => {
  try {
    await fs.writeFile(TUTORIAL_FILE, 'true');
    return true;
  } catch (error) {
    console.error('Error writing tutorial file:', error);
    return false;
  }
});

// Minecraft Verification
ipcMain.handle('verify-minecraft', async () => {
  try {
    const authManager = new Auth("select_account");
    const xboxManager = await authManager.launch("electron");
    const token = await xboxManager.getMinecraft();
    const mclcToken = token.mclc();
    
    // Check if account owns Minecraft by getting profile
    let ownsMinecraft = false;
    let uuid = mclcToken.uuid;
    let name = mclcToken.name;
    
    try {
      const prof = await axios.get('https://api.minecraftservices.com/minecraft/profile', {
        headers: {
          'Authorization': `Bearer ${mclcToken.access_token}`,
          'Accept': 'application/json',
          'User-Agent': 'aiom-launcher'
        },
        timeout: 15000,
        validateStatus: () => true
      });
      const ct = String(prof.headers?.['content-type'] || '');
      if (prof.status === 200 && ct.includes('application/json') && prof.data && prof.data.id && prof.data.name) {
        ownsMinecraft = true;
        uuid = prof.data.id;
        name = prof.data.name;
      }
    } catch {
      ownsMinecraft = false;
    }
    
    if (!ownsMinecraft) {
      return { success: false, ownsMinecraft: false, error: 'This account does not own Minecraft' };
    }
    
    const config = await getGlobalOptions();
    config.minecraftVerified = true;
    config.minecraftVerifiedAccount = {
      id: uuid || mclcToken.uuid || crypto.randomUUID(),
      name: name || 'Player',
      uuid: uuid || mclcToken.uuid,
      verifiedAt: new Date().toISOString()
    };
    await fs.writeJson(GLOBAL_CONFIG_FILE, config, { spaces: 2 });
    
    return { success: true, ownsMinecraft: true, account: config.minecraftVerifiedAccount };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('get-minecraft-verification', async () => {
  try {
    const config = await getGlobalOptions();
    return {
      verified: !!config.minecraftVerified,
      account: config.minecraftVerifiedAccount || null
    };
  } catch (e: any) {
    return { verified: false, account: null };
  }
});

ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('copy-to-clipboard', async (_, text) => {
  clipboard.writeText(text);
});

ipcMain.handle('login-microsoft', async () => {
  try {
    const authManager = new Auth("select_account");
    const xboxManager = await authManager.launch("electron");
    const token = await xboxManager.getMinecraft();
    const config = await getGlobalOptions();
    const mclcToken = token.mclc();
    if (!config.accounts) config.accounts = [];
    let uuid = mclcToken.uuid;
    let name = mclcToken.name;
    let profileWarning = false;
    try {
      const prof = await axios.get('https://api.minecraftservices.com/minecraft/profile', {
        headers: {
          'Authorization': `Bearer ${mclcToken.access_token}`,
          'Accept': 'application/json',
          'User-Agent': 'aiom-launcher'
        },
        timeout: 10000,
        validateStatus: () => true
      });
      const ct = String(prof.headers?.['content-type'] || '');
      if (prof.status === 200 && ct.includes('application/json') && prof.data && prof.data.id && prof.data.name) {
        uuid = prof.data.id;
        name = prof.data.name;
      } else {
        profileWarning = true;
      }
    } catch {
      profileWarning = true;
    }
    const newAccount = {
      id: uuid || mclcToken.uuid || crypto.randomUUID(),
      type: 'microsoft',
      name: name || 'Player',
      accessToken: mclcToken.access_token,
      userProperties: mclcToken.user_properties || {},
      uuid: uuid || mclcToken.uuid || '00000000-0000-0000-0000-000000000000'
    };
    const existingIndex = config.accounts.findIndex((a: any) => a.id === newAccount.id || a.uuid === newAccount.uuid);
    if (existingIndex >= 0) {
      config.accounts[existingIndex] = newAccount;
    } else {
      config.accounts.push(newAccount);
    }
    config.selectedAccountId = newAccount.id;
    config.authMode = 'online';
    await fs.writeJson(GLOBAL_CONFIG_FILE, config, { spaces: 2 });
    return { success: true, account: newAccount, warning: profileWarning ? 'profile_fetch_failed' : undefined };
  } catch (e: any) {
    const raw = e;
    let msg = '';
    if (raw && typeof raw === 'object') {
      msg = raw.message || raw.error_description || raw.error || raw.code || '';
      if (!msg) {
        try { msg = JSON.stringify(raw); } catch {}
      }
    } else if (typeof raw === 'string') {
      msg = raw;
    }
    if (!msg) msg = 'Unknown error';
    console.error('Microsoft Login Error:', raw);
    return { success: false, error: `Login failed: ${msg}` };
  }
});

ipcMain.handle('add-offline-account', async (_, name) => {
  try {
    if (!name) return { success: false, error: 'Name is required' };
    
    const config = await getGlobalOptions();
    if (!config.accounts) config.accounts = [];
    
    const id = crypto.randomUUID();
    const newAccount = {
      id: id,
      type: 'offline',
      name: name,
      accessToken: 'offline',
      uuid: offlineUuid(name)
    };
    
    config.accounts.push(newAccount);
    config.selectedAccountId = id;
    config.authMode = 'offline';
    
    await fs.writeJson(GLOBAL_CONFIG_FILE, config);
    return { success: true, account: newAccount };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('select-account', async (_, accountId) => {
  try {
    const config = await getGlobalOptions();
    if (!config.accounts) return { success: false, error: 'No accounts found' };
    
    const account = config.accounts.find((a: any) => a.id === accountId);
    if (!account) return { success: false, error: 'Account not found' };
    
    config.selectedAccountId = accountId;
    config.authMode = account.type === 'microsoft' ? 'online' : 'offline';
    
    await fs.writeJson(GLOBAL_CONFIG_FILE, config);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('remove-account', async (_, accountId) => {
  try {
    const config = await getGlobalOptions();
    if (!config.accounts) return { success: false, error: 'No accounts found' };
    
    config.accounts = config.accounts.filter((a: any) => a.id !== accountId);
    
    if (config.selectedAccountId === accountId) {
      if (config.accounts.length > 0) {
        config.selectedAccountId = config.accounts[0].id;
        config.authMode = config.accounts[0].type === 'microsoft' ? 'online' : 'offline';
      } else {
        config.selectedAccountId = null;
        config.authMode = 'offline';
      }
    }
    
    await fs.writeJson(GLOBAL_CONFIG_FILE, config);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('logout-accounts', async () => {
  try {
    const config = await getGlobalOptions();
    config.accounts = [];
    config.selectedAccountId = null;
    config.authMode = 'offline';
    await fs.writeJson(GLOBAL_CONFIG_FILE, config, { spaces: 2 });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});
// --- New Features ---

function sanitizeGameArgs(json: any) {
  if (!json || !json.arguments || !Array.isArray(json.arguments.game)) return;
  const filtered: any[] = [];
  for (const arg of json.arguments.game) {
    try {
      if (typeof arg === 'string') {
        if (arg.trim() === '--demo') continue;
        if (arg.includes('quickPlay')) continue;
        filtered.push(arg);
      } else if (arg && typeof arg === 'object') {
        const val = arg.value;
        const values = Array.isArray(val) ? val : (typeof val === 'string' ? [val] : []);
        const hasQuick = values.some((v: any) => typeof v === 'string' && v.includes('quickPlay'));
        const hasDemo = values.some((v: any) => typeof v === 'string' && v.trim() === '--demo');
        if (hasQuick || hasDemo) continue;
        if (arg.rules && Array.isArray(arg.rules)) {
          const hasQuickRule = arg.rules.some((r: any) => r.features && Object.keys(r.features).some(k => String(k).toLowerCase().includes('quick_play')));
          const hasDemoRule = arg.rules.some((r: any) => r.features && (r.features.is_demo_user === true));
          if (hasQuickRule || hasDemoRule) continue;
        }
        filtered.push(arg);
      }
    } catch {}
  }
  json.arguments.game = filtered;
}
async function ensureBaseVersionJson(version: string): Promise<any | null> {
  const dir = path.join(MINECRAFT_ROOT, 'versions', version);
  const file = path.join(dir, `${version}.json`);
  if (await fs.pathExists(file)) {
    try { return await fs.readJson(file); } catch {}
  }
  try {
    const manifest = await getVersionManifest();
    const entry = (manifest?.versions || []).find((v: any) => v.id === version);
    if (!entry?.url) return null;
    const res = await axios.get(entry.url, { timeout: 20000 });
    await fs.ensureDir(dir);
    await fs.writeJson(file, res.data, { spaces: 2 });
    if (res.data?.downloads?.client?.url) {
      const jarPath = path.join(dir, `${version}.jar`);
      if (!(await fs.pathExists(jarPath))) await downloadFile(res.data.downloads.client.url, jarPath);
    }
    return res.data;
  } catch {
    return null;
  }
}
function mergeVersionJson(base: any, loaderJson: any | null, customName: string): any {
  if (!loaderJson) {
    const merged = { ...base, id: customName, jar: `${customName}.jar` };
    delete merged.inheritsFrom;
    return merged;
  }
  const libMap = new Map<string, any>();
  const addLibs = (libs: any[]) => {
    for (const lib of libs || []) {
      if (!lib || !lib.name) continue;
      const parts = String(lib.name).split(':');
      if (parts.length < 2) continue;
      libMap.set(`${parts[0]}:${parts[1]}`, lib);
    }
  };
  addLibs(base.libraries);
  addLibs(loaderJson.libraries);
  const baseArgs = base.arguments || {};
  const loaderArgs = loaderJson.arguments || {};
  const baseGame = Array.isArray(baseArgs.game) ? baseArgs.game : [];
  const loaderGame = Array.isArray(loaderArgs.game) ? loaderArgs.game : [];
  const baseJvm = Array.isArray(baseArgs.jvm) ? baseArgs.jvm : [];
  const loaderJvm = Array.isArray(loaderArgs.jvm) ? loaderArgs.jvm : [];
  const merged: any = {
    ...base,
    id: customName,
    jar: `${customName}.jar`,
    mainClass: loaderJson.mainClass || base.mainClass,
    libraries: [...libMap.values()]
  };
  delete merged.inheritsFrom;
  if (baseGame.length || loaderGame.length || baseJvm.length || loaderJvm.length) {
    merged.arguments = { game: [...baseGame, ...loaderGame], jvm: [...baseJvm, ...loaderJvm] };
    delete merged.minecraftArguments;
  }
  return merged;
}
async function prepareMergedVersion(mcVersion: string, loader: string): Promise<{ customName: string; dir: string; loaderJvm: any[] } | null> {
  try {
    const version = await resolveValidMinecraftVersion(mcVersion);
    const base = await ensureBaseVersionJson(version);
    if (!base) return null;
    const l = String(loader || '').toLowerCase();
    let profileId: string | null = null;
    if (l === 'fabric') profileId = await ensureFabricProfile(version);
    else if (l === 'quilt') profileId = await ensureQuiltProfile(version);
    else if (l === 'forge' || l.includes('kingmodloader')) profileId = await ensureForgeProfile(version);
    else if (l === 'neoforge') profileId = (await ensureNeoForgeProfile(version)) || (await ensureForgeProfile(version));
    let loaderJson: any | null = null;
    if (profileId) {
      const p = path.join(MINECRAFT_ROOT, 'versions', profileId, `${profileId}.json`);
      if (await fs.pathExists(p)) loaderJson = await fs.readJson(p).catch(() => null);
    }
    const slug = (l || 'vanilla').replace(/[^a-z0-9]+/gi, '') || 'vanilla';
    const customName = `aiom-${version}-${slug}`;
    const merged = mergeVersionJson(base, loaderJson, customName);
    sanitizeGameArgs(merged);
    const customDir = path.join(MINECRAFT_ROOT, 'versions', customName);
    await fs.ensureDir(customDir);
    await fs.writeJson(path.join(customDir, `${customName}.json`), merged, { spaces: 2 });
    const baseJar = path.join(MINECRAFT_ROOT, 'versions', version, `${version}.jar`);
    const customJar = path.join(customDir, `${customName}.jar`);
    if (await fs.pathExists(baseJar) && !(await fs.pathExists(customJar))) {
      await fs.copy(baseJar, customJar).catch(() => {});
    }
    const loaderJvm = Array.isArray(loaderJson?.arguments?.jvm) ? loaderJson.arguments.jvm : [];
    return { customName, dir: customDir, loaderJvm };
  } catch {
    return null;
  }
}
function detectLoaderFromDeps(deps: any): { loader: string; loaderLabel: string } {
  const d = deps || {};
  if (d['fabric-loader']) return { loader: 'fabric', loaderLabel: 'Fabric' };
  if (d['quilt-loader']) return { loader: 'quilt', loaderLabel: 'Quilt' };
  if (d.neoforge) return { loader: 'neoforge', loaderLabel: 'NeoForge' };
  if (d.forge) return { loader: 'forge', loaderLabel: 'Forge' };
  return { loader: 'vanilla', loaderLabel: 'Vanilla' };
}
async function installModpack(project: any, packName?: string): Promise<{ success: boolean; file?: string; error?: string; pack?: string }> {
  try {
    const projectId = project?.project_id || project?.projectId || project?.slug;
    if (!projectId) return { success: false, error: 'Unknown modpack project' };
    const versionsRes = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`).catch(() => null);
    const versions = versionsRes?.data || [];
    if (!Array.isArray(versions) || versions.length === 0) return { success: false, error: 'No modpack versions available' };
    const target = versions[0];
    const file = target.files?.find((f: any) => f.primary) || target.files?.[0];
    if (!file?.url) return { success: false, error: 'No modpack download found' };
    const desired = String(packName && packName.trim() ? packName : (target.name || project.title || 'Modpack'));
    const name = desired.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Modpack';
    const packPath = path.join(MOD_PACKS_PATH, name);
    await fs.ensureDir(packPath);
    await fs.ensureDir(path.join(packPath, 'mods'));
    const mrpackPath = path.join(packPath, '.aiom.mrpack');
    if (!(await downloadFile(file.url, mrpackPath))) return { success: false, error: 'Failed to download modpack archive' };
    let index: any;
    const zip = new AdmZip(mrpackPath);
    const indexEntry = zip.getEntry('modrinth.index.json');
    if (!indexEntry) {
      await fs.remove(mrpackPath).catch(() => {});
      return { success: false, error: 'Invalid modpack (missing modrinth.index.json)' };
    }
    try {
      index = JSON.parse(indexEntry.getData().toString('utf8'));
    } catch {
      await fs.remove(mrpackPath).catch(() => {});
      return { success: false, error: 'Failed to parse modpack index' };
    }
    const deps = index.dependencies || {};
    const { loader, loaderLabel } = detectLoaderFromDeps(deps);
    const mcVersion = String(deps.minecraft || '');
    const files: any[] = Array.isArray(index.files) ? index.files : [];
    for (const entry of files) {
      try {
        const env = entry.env || {};
        if (String(env.client || '').toLowerCase() === 'unsupported') continue;
        const rel = String(entry.path || '').replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');
        if (!rel) continue;
        const url = Array.isArray(entry.downloads) && entry.downloads.length > 0 ? entry.downloads[0] : null;
        if (!url) continue;
        const dest = path.join(packPath, rel);
        if (await fs.pathExists(dest)) continue;
        await downloadFile(url, dest);
      } catch {}
    }
    for (const entry of zip.getEntries()) {
      try {
        const entryName = entry.entryName.replace(/\\/g, '/');
        let prefix = '';
        if (entryName.startsWith('overrides/')) prefix = 'overrides/';
        else if (entryName.startsWith('client-overrides/')) prefix = 'client-overrides/';
        else continue;
        if (entry.isDirectory) continue;
        const rel = entryName.slice(prefix.length);
        if (!rel) continue;
        const dest = path.join(packPath, rel);
        await fs.ensureDir(path.dirname(dest));
        await fs.writeFile(dest, entry.getData());
      } catch {}
    }
    await fs.remove(mrpackPath).catch(() => {});
    await fs.ensureDir(path.join(packPath, 'saves'));
    await fs.ensureDir(path.join(packPath, 'resourcepacks'));
    await fs.ensureDir(path.join(packPath, 'shaderpacks'));
    const meta = {
      name,
      version: mcVersion || 'unknown',
      loader: loaderLabel,
      source: 'modrinth',
      mrpack: projectId,
      mrpackVersion: target.version_number || target.name,
      installedAt: new Date().toISOString()
    };
    await fs.writeJson(path.join(packPath, 'meta.json'), meta, { spaces: 2 });
    if (mainWindow) mainWindow.webContents.send('pack-updated', { pack: name, installed: files.length });
    return { success: true, pack: name, file: file.filename };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

ipcMain.handle('get-minecraft-versions', async () => {
  try {
    const response = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    return response.data.versions;
  } catch (error) {
    console.error('Error fetching Minecraft versions:', error);
    return [];
  }
});

ipcMain.handle('launch-game', async (_, packName, worldName, serverIp) => {
  try {
    if (isLaunching) {
      if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: 'Launch already in progress' });
      return true;
    }
    const globalOptions = await getGlobalOptions();
    if (!globalOptions.minecraftVerified) {
      if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'failed', error: 'Cannot launch. Please make sure you have verified your Minecraft so you can play.' });
      return false;
    }
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'starting', pack: packName });
    
    // Determine active account
    let auth = {
      access_token: 'offline',
      name: 'Player',
      uuid: '00000000-0000-0000-0000-000000000000',
      user_properties: {}
    };

    if (globalOptions.selectedAccountId && globalOptions.accounts) {
        const selected = globalOptions.accounts.find((a: any) => a.id === globalOptions.selectedAccountId);
        if (selected) {
            if (selected.type === 'microsoft') {
                 auth = {
                    access_token: selected.accessToken,
                    name: selected.name,
                    uuid: selected.uuid,
                    user_properties: selected.userProperties
                 };
            } else {
                 auth = {
                    access_token: 'offline',
                    name: selected.name,
                    uuid: selected.uuid || offlineUuid(selected.name),
                    user_properties: {}
                 };
            }
        }
    } else if (globalOptions.offlineName) {
        // Fallback to legacy offline name
        auth.name = globalOptions.offlineName;
        auth.uuid = offlineUuid(globalOptions.offlineName);
    }

    const packPath = path.join(MOD_PACKS_PATH, packName);
    if (!await fs.pathExists(packPath)) {
      if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'failed', error: 'Pack not found' });
      return false;
    }
    
    // Read meta.json for version
    const metaPath = path.join(packPath, 'meta.json');
    let version = '1.20.1'; // Default
    let loaderInfo = 'vanilla';
    
    if (await fs.pathExists(metaPath)) {
      const meta = await fs.readJson(metaPath);
      if (meta.version && meta.version !== 'unknown') version = await resolveValidMinecraftVersion(meta.version);
      if (meta.loader) {
        const l = String(meta.loader).toLowerCase();
        loaderInfo = l === 'kingmodloader' ? 'forge (KingModLoader)' : l;
      }
    }
    if (!version || version === 'unknown' || version === '') {
      try {
        version = await resolveValidMinecraftVersion(version);
      } catch {}
    }

    console.log(`Launching ${packName}...`);
    console.log(`User: ${auth.name} (${auth.access_token === 'offline' ? 'Offline' : 'Online'})`);
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: `Loader: ${loaderInfo}` });
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: `Resolved Minecraft version: ${version}` });
    const reqMajor = requiredJavaMajor(version);
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: `Ensuring Java ${reqMajor}` });

  let javaPath = await ensureJavaPath(version);
  if (!javaPath) {
    const major = requiredJavaMajor(version);
    let zulu: string | null = null;
    let temurin: string | null = null;
    let microsoft: string | null = null;
    try { zulu = await ensureZuluJava(major); } catch {}
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: zulu ? 'Installed Zulu JRE' : 'Zulu JRE unavailable, trying Temurin' });
    try { temurin = await ensureTemurinJava(major); } catch {}
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: temurin ? 'Installed Temurin JRE' : 'Temurin JRE unavailable, trying Microsoft JDK' });
    try { microsoft = await ensureMicrosoftJava(major); } catch {}
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: microsoft ? 'Installed Microsoft JDK' : 'Microsoft JDK unavailable' });
    javaPath = zulu || temurin || microsoft || null;
    if (!javaPath) {
      if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'failed', error: `Java ${major} auto-install failed` });
      return false;
    }
  }
  const detectedMajor = detectJavaMajor(javaPath);
  if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: `Using Java ${detectedMajor} at ${javaPath}` });
    const opts = {
      clientPackage: null,
      authorization: auth,
      root: MINECRAFT_ROOT,
      version: {
        number: version,
        type: 'release'
      },
      memory: {
        max: '4G',
        min: '2G'
      },
      javaPath: javaPath || undefined,
      customLaunchArgs: [] as string[],
      customArgs: [] as string[],
      features: [] as string[],
      overrides: {
        gameDirectory: packPath,
        minArgs: 999
      }
    };
    async function ensureModrinthMod(projectSlug: string, loader: string, mcVersion: string, modsDir: string): Promise<boolean> {
      try {
        await fs.ensureDir(modsDir);
        const projRes = await axios.get(`https://api.modrinth.com/v2/project/${projectSlug}`).catch(() => null);
        const proj = projRes?.data;
        if (!proj || !proj.id) return false;
        const versionsRes = await axios.get(`https://api.modrinth.com/v2/project/${proj.id}/version`, {
          params: {
            loaders: JSON.stringify([loader]),
            game_versions: JSON.stringify([mcVersion])
          }
        }).catch(() => null);
        let versions = versionsRes?.data || [];
        if (!Array.isArray(versions) || versions.length === 0) {
          const fallbackRes = await axios.get(`https://api.modrinth.com/v2/project/${proj.id}/version`).catch(() => null);
          versions = fallbackRes?.data || [];
        }
        if (!Array.isArray(versions) || versions.length === 0) return false;
        const target = versions.find((v: any) => Array.isArray(v.loaders) && v.loaders.includes(loader)) || versions[0];
        const file = target?.files?.find((f: any) => f.primary) || target?.files?.[0];
        if (!file || !file.filename || !file.url) return false;
        const jarPath = path.join(modsDir, file.filename);
        if (await fs.pathExists(jarPath)) return true;
        const resp = await axios.get(file.url, { responseType: 'arraybuffer' }).catch(() => null);
        if (!resp?.data) return false;
        await fs.writeFile(jarPath, resp.data);
        return true;
      } catch {
        return false;
      }
    }
    const loaderLower2 = String(loaderInfo || '').toLowerCase();
    const modsDir2 = path.join(packPath, 'mods');
    if (auth.access_token === 'offline') {
      await ensureModrinthMod('no-chat-reports', loaderLower2, version, modsDir2);
      await ensureModrinthMod('world-host', loaderLower2, version, modsDir2);
      await ensureModrinthMod('e4mc', loaderLower2, version, modsDir2);
    }
    await ensureLoaderSplash(packPath, version);
    // Per-account skin overlay
    // Applied globally to all instances (Vanilla & Modded) as requested
    let accountSkinPath: string | undefined = undefined;
    {
      const selectedId = globalOptions.selectedAccountId;
      if (selectedId && Array.isArray(globalOptions.accounts)) {
        const acc = globalOptions.accounts.find((a: any) => a.id === selectedId);
        if (acc && acc.skinPath) {
          accountSkinPath = String(acc.skinPath);
          await ensureAccountSkinOverlay(packPath, accountSkinPath, version);
        }
      }
    }
    const loaderLower = loaderLower2;
    const mergedProfile = await prepareMergedVersion(version, loaderLower);
    if (mergedProfile) {
      opts.version.number = mergedProfile.customName;
      (opts.version as any).custom = mergedProfile.customName;
      opts.version.type = 'release';
      (opts.overrides as any).versionName = version;
      (opts.overrides as any).directory = mergedProfile.dir;
      if (mergedProfile.loaderJvm.length > 0) {
        const libDir = path.join(MINECRAFT_ROOT, 'libraries');
        const substitute = (s: any): string => {
          if (typeof s !== 'string') return String(s);
          return s
            .replace(/\$\{library_directory\}/g, libDir)
            .replace(/\$\{libraries_directory\}/g, libDir)
            .replace(/\$\{classpath_separator\}/g, PATH_SEP)
            .replace(/\$\{version_name\}/g, version)
            .replace(/\$\{game_directory\}/g, packPath)
            .replace(/\$\{assets_root\}/g, path.join(MINECRAFT_ROOT, 'assets'))
            .replace(/\$\{game_assets\}/g, path.join(MINECRAFT_ROOT, 'assets'));
        };
        opts.customArgs = mergedProfile.loaderJvm.filter((a: any) => typeof a === 'string').map(substitute);
      }
      if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: `Prepared ${loaderLower || 'vanilla'} profile ${mergedProfile.customName}` });
    }
    // Ensure CustomSkinLoader for online accounts to override skins when possible
    const accName = String(auth.name || 'Player');
    await ensureCustomSkinLoader(packPath, accName, version, loaderLower, accountSkinPath || undefined);
    if (serverIp && typeof serverIp === 'string' && serverIp.trim().length > 0) {
      const raw = String(serverIp).trim();
      let host = raw;
      let port = '25565';
      const colon = raw.indexOf(':');
      if (colon > 0) {
        host = raw.slice(0, colon);
        port = raw.slice(colon + 1) || '25565';
      }
      // Use legacy server args only; do not set quickPlay to avoid conflicts
      opts.customLaunchArgs = ['--server', host, '--port', port];
      if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'debug', message: `Joining server ${host}:${port}` });
    }

    // Listeners for logs (use global handlers for background tracking)
    const procId2 = `proc_${++processCounter}_${Date.now()}`;
    runningProcesses.set(procId2, {
      id: procId2,
      packName,
      status: 'launching',
      pid: null,
      startedAt: Date.now()
    });
    processLogs.set(procId2, [`[Starting launch for ${packName}]`]);
    broadcastProcesses();
    
    try {
      const child = await launcher.launch(opts as any);
      if (child && (child as any).pid) {
        runningProcesses.set(procId2, { ...(runningProcesses.get(procId2) || {}), pid: (child as any).pid });
        minecraftProcesses.set(procId2, child);
        processLogs.set(procId2, [...(processLogs.get(procId2) || []), `[Minecraft process started (pid ${(child as any).pid})]`]);
        broadcastProcesses();
      }
    } catch (e: any) {
      runningProcesses.set(procId2, { ...(runningProcesses.get(procId2) || {}), status: 'failed' });
      processLogs.set(procId2, [...(processLogs.get(procId2) || []), `[Launch error] ${e?.message || e}`]);
      broadcastProcesses();
      throw e;
    }
    
    setDiscordActivity(`Playing ${packName}`, `Version: ${version}`);
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'running', pack: packName, version });
    const proc = runningProcesses.get(procId2);
    if (proc) {
      proc.status = 'running';
      processLogs.set(procId2, [...(processLogs.get(procId2) || []), `[Minecraft started - ${version}]`]);
      broadcastProcesses();
    }

    return true;
    // Add processes IPC
  } catch (error: any) {
    console.error('Error launching game:', error);
    if (mainWindow) mainWindow.webContents.send('launch-status', { state: 'failed', error: error.message });
    isLaunching = false;
    return false;
  }
});

ipcMain.handle('stop-minecraft', async (_, processId: string) => {
  try {
    const proc = runningProcesses.get(processId);
    if (!proc) return { success: false };
    const child = minecraftProcesses.get(processId);
    if (child) {
      try {
        if (IS_WIN) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        } else {
          try { child.kill('SIGTERM'); } catch {}
          setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 3000);
        }
      } catch {}
      minecraftProcesses.delete(processId);
    }
    proc.status = 'stopped';
    processLogs.set(processId, [...(processLogs.get(processId) || []), '[Process stopped by user]']);
    broadcastProcesses();
    setTimeout(() => {
      runningProcesses.delete(processId);
      processLogs.delete(processId);
      broadcastProcesses();
    }, 2000);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-running-processes', async () => {
  const procs = Array.from(runningProcesses.values()).map((p: any) => ({
    id: p.id,
    packName: p.packName,
    status: p.status,
    pid: p.pid,
    startedAt: p.startedAt,
    logs: (processLogs.get(p.id) || []).slice(-200)
  }));
  return procs;
});

ipcMain.handle('search-modrinth', async (_, query, type, version, loader) => {
  try {
    // type can be 'mod', 'modpack', 'resourcepack', 'shader'
    const facets = [];
    const normalizedLoader = loader && String(loader).toLowerCase() === 'kingmodloader' ? 'forge' : loader;
    if (type) facets.push([`project_type:${type}`]);
    if (version) facets.push([`versions:${version}`]);
    if (normalizedLoader) facets.push([`categories:${normalizedLoader}`]);

    const response = await axios.get(`https://api.modrinth.com/v2/search`, {
      params: {
        query,
        limit: 20,
        facets: facets.length > 0 ? JSON.stringify(facets) : undefined
      }
    });
    return response.data.hits;
  } catch (error) {
    console.error('Modrinth search error:', error);
    return [];
  }
});

ipcMain.handle('install-project', async (_, project, packName) => {
  try {
    if (project?.project_type === 'modpack') {
      return await installModpack(project, packName);
    }

    if (!packName) return { success: false, error: 'Target mod pack not specified' };

    const packPath = path.join(MOD_PACKS_PATH, packName);
    const metaPath = path.join(packPath, 'meta.json');
    let mcVersion = '';
    let loader = 'fabric';

    if (await fs.pathExists(metaPath)) {
      const meta = await fs.readJson(metaPath);
      if (meta.version && meta.version !== 'unknown') mcVersion = meta.version;
      if (meta.loader) loader = String(meta.loader).toLowerCase();
      if (loader === 'kingmodloader' || loader.includes('kingmodloader')) loader = 'forge';
    }
    if (loader === 'vanilla') {
      return { success: false, error: 'Cannot install mods to a Vanilla pack' };
    }
    const resolvedMc = await resolveValidMinecraftVersion(mcVersion);

    const projectId = project?.project_id || project?.projectId || project?.slug;
    if (!projectId) return { success: false, error: 'Unknown project' };
    const fetchVersions = async (params?: any) =>
      axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`, params ? { params } : undefined)
        .then(r => r.data).catch(() => []);
    let versions: any[] = await fetchVersions({ loaders: JSON.stringify([loader]), game_versions: JSON.stringify([resolvedMc]) });
    if (!Array.isArray(versions) || versions.length === 0) {
      versions = await fetchVersions();
    }
    if (!Array.isArray(versions) || versions.length === 0) {
      return { success: false, error: `No compatible version found for ${resolvedMc} (${loader})` };
    }
    const exact = versions.find((v: any) =>
      Array.isArray(v.loaders) && v.loaders.includes(loader) &&
      Array.isArray(v.game_versions) && v.game_versions.includes(resolvedMc));
    const loaderOnly = versions.find((v: any) => Array.isArray(v.loaders) && v.loaders.includes(loader));
    const targetVersion = exact || loaderOnly || versions[0];
    const file = targetVersion.files?.find((f: any) => f.primary) || targetVersion.files?.[0];

    if (!file) return { success: false, error: 'No file found' };

    let targetFolder = 'mods';
    if (project.project_type === 'resourcepack') targetFolder = 'resourcepacks';
    if (project.project_type === 'shader') targetFolder = 'shaderpacks';

    const downloadDir = path.join(packPath, targetFolder);
    await fs.ensureDir(downloadDir);
    const downloadPath = path.join(downloadDir, file.filename);

    if (!(await downloadFile(file.url, downloadPath))) {
      return { success: false, error: 'Download failed' };
    }

    if (mainWindow) mainWindow.webContents.send('pack-updated', { pack: packName, file: file.filename });
    return { success: true, file: file.filename };

  } catch (error: any) {
    console.error('Install error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('analyze-url', async (_, url) => {
  try {
    if (url.includes('github.com')) {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        const [_, owner, repo] = match;
        // Check for pack config
        try {
            const apiRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents`);
            const files = apiRes.data;
            if (Array.isArray(files)) {
                const isPack = files.some((f: any) => f.name === 'modrinth.index.json' || f.name === 'manifest.json' || f.name === 'pack.mcmeta');
                if (isPack) return { type: 'modpack', name: repo };
            }
        } catch (e) {
            // Ignore API error, fallback to mod
        }
        return { type: 'mod', name: repo };
      }
    }
    // Simple check for other URLs
    if (url.includes('modrinth.com')) return { type: 'mod', name: 'Modrinth Resource' };
    if (url.includes('curseforge.com')) return { type: 'mod', name: 'CurseForge Resource' };
    
    return { type: 'unknown', name: 'Unknown Resource' };
  } catch (e) {
    return null;
  }
});

ipcMain.handle('install-from-url', async (_, url, packName) => {
    try {
        if (url.includes('github.com')) {
             // Install GitHub Modpack or Mod
             // If packName is NOT provided, we assume it's a modpack install (create new pack)
             // If packName IS provided, we assume it's a mod/resource install
             
             const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
             if (!match) return { success: false, error: 'Invalid GitHub URL' };
             const [_, owner, repo] = match;

             if (!packName) {
                 // Install as Modpack
                 const packDir = path.join(MOD_PACKS_PATH, repo);
                 if (await fs.pathExists(packDir)) return { success: false, error: 'Mod pack already exists' };
                 
                 // Download zip
                 const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`; // Try main
                 // Better: get default branch
                 
                 const downloadPath = path.join(APP_DATA_PATH, 'temp_pack.zip');
                 
                 const response = await axios({
                    method: 'get',
                    url: zipUrl,
                    responseType: 'stream'
                });
                
                const totalLength = response.headers['content-length'];
                let downloadedLength = 0;
                
                if (mainWindow) mainWindow.webContents.send('download-progress', { percent: 0, status: 'Downloading Modpack...' });

                const writer = fs.createWriteStream(downloadPath);
                response.data.on('data', (chunk: any) => {
                    downloadedLength += chunk.length;
                    if (totalLength && mainWindow) {
                        const percent = downloadedLength / (parseInt(String(totalLength), 10) || downloadedLength);
                        mainWindow.webContents.send('download-progress', { percent, status: 'Downloading Modpack...' });
                    }
                });
                
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                     writer.on('finish', () => resolve(true));
                     writer.on('error', reject);
                 });
                 
                 if (mainWindow) mainWindow.webContents.send('download-progress', { percent: 1, status: 'Extracting...' });
                 
                 try {
                     const zip = new AdmZip(downloadPath);
                     zip.extractAllTo(packDir, true);
                     
                     // Check if it extracted into a subdirectory (common with GitHub archives)
                     const extractedFiles = await fs.readdir(packDir);
                     if (extractedFiles.length === 1 && (await fs.stat(path.join(packDir, extractedFiles[0]))).isDirectory()) {
                         const subDir = path.join(packDir, extractedFiles[0]);
                         const subFiles = await fs.readdir(subDir);
                         for (const f of subFiles) {
                             await fs.move(path.join(subDir, f), path.join(packDir, f));
                         }
                         await fs.rmdir(subDir);
                     }

                     // Cleanup zip
                     await fs.remove(downloadPath);

                     // Create meta.json if not exists
                     const metaPath = path.join(packDir, 'meta.json');
                     if (!await fs.pathExists(metaPath)) {
                          await fs.writeJson(metaPath, {
                              name: repo,
                              loader: 'unknown',
                              version: 'unknown',
                              created: new Date().toISOString(),
                              imported: true,
                              source: url
                          }, { spaces: 2 });
                     }
                     
                     return { success: true };
                 } catch (zipError: any) {
                     return { success: false, error: 'Failed to extract zip: ' + zipError.message };
                 }
            } else {
                 // Install as Mod into existing pack
                 // Need to find the .jar file in releases?
                 // Or just download the source? Usually mods are in releases.
                 
                // Fetch release assets (supports direct asset URL or tag)
                const isDirectAsset = /\/releases\/download\//i.test(url);
                const tagMatch = url.match(/\/releases\/tag\/([^\/]+)/i);
                let assets: any[] = [];
                if (isDirectAsset) {
                  assets = [{ name: path.basename(url.split('?')[0]), browser_download_url: url }];
                } else {
                  const apiHeaders = { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'aiom-launcher' } };
                  const releaseRes = tagMatch
                    ? await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagMatch[1]}`, apiHeaders)
                    : await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, apiHeaders);
                  assets = Array.isArray(releaseRes.data.assets) ? releaseRes.data.assets : [];
                }
                const packPath = path.join(MOD_PACKS_PATH, packName);
                const metaPath = path.join(packPath, 'meta.json');
                let preferredLoader: string | null = null;
                if (await fs.pathExists(metaPath)) {
                  const meta = await fs.readJson(metaPath);
                  const loader = String(meta.loader || '').toLowerCase();
                  if (loader === 'vanilla') {
                    return { success: false, error: 'Cannot install mods to a Vanilla pack' };
                  }
                  preferredLoader = loader === 'kingmodloader' ? 'forge' : loader;
                }
                const excludeRegex = /(sources|source|javadoc|dev|test|example|installer)/i;
                const jars = assets.filter(a => /\.jar$/i.test(a.name) && !excludeRegex.test(a.name));
                const loaderTokens: Record<string, string[]> = {
                  fabric: ['fabric'],
                  forge: ['forge', 'neoforge'],
                  neoforge: ['neoforge'],
                  quilt: ['quilt']
                };
                const versionTokens: string[] = [];
                if (await fs.pathExists(metaPath)) {
                  const meta = await fs.readJson(metaPath);
                  const vt = String(meta.version || '').toLowerCase();
                  if (vt && vt !== 'unknown') {
                    versionTokens.push(vt);
                    const parts = vt.split('.');
                    if (parts.length >= 2) versionTokens.push(`${parts[0]}.${parts[1]}`);
                  }
                }
                let best: any = null;
                let bestScore = -1;
                for (const a of jars) {
                  const n = String(a.name).toLowerCase();
                  let score = 0;
                  if (preferredLoader && loaderTokens[preferredLoader]) {
                    for (const t of loaderTokens[preferredLoader]) {
                      if (n.includes(t)) { score += 2; break; }
                    }
                  }
                  for (const vt of versionTokens) {
                    if (vt && n.includes(vt)) { score += 1; break; }
                  }
                  if (score > bestScore) { bestScore = score; best = a; }
                }
                let asset = best || jars[0];
                 
                 if (asset) {
                    const downloadPath = path.join(packPath, 'mods', asset.name);
                     const response = await axios({
                        method: 'get',
                        url: asset.browser_download_url,
                        responseType: 'stream',
                        headers: { 'User-Agent': 'aiom-launcher' }
                    });
                    
                    const totalLength = response.headers['content-length'];
                    let downloadedLength = 0;
                    if (mainWindow) mainWindow.webContents.send('download-progress', { percent: 0, status: 'Downloading from GitHub...' });

                    const writer = fs.createWriteStream(downloadPath);
                    response.data.on('data', (chunk: any) => {
                        downloadedLength += chunk.length;
                        if (totalLength && mainWindow) {
                            const percent = downloadedLength / parseInt(String(totalLength));
                            mainWindow.webContents.send('download-progress', { percent, status: 'Downloading from GitHub...' });
                        }
                    });

                    response.data.pipe(writer);
                    await new Promise((resolve, reject) => {
                        writer.on('finish', () => {
                            if (mainWindow) mainWindow.webContents.send('download-progress', { percent: 1, status: 'Complete' });
                            if (mainWindow) mainWindow.webContents.send('pack-updated', { packName });
                            resolve(true);
                        });
                        writer.on('error', reject);
                    });
                    return { success: true };
                 } else {
                     return { success: false, error: 'No .jar asset found in latest release' };
                 }
            }
        } else if (url.includes('modrinth.com')) {
            if (!packName) return { success: false, error: 'Target mod pack not specified' };
            const packPath = path.join(MOD_PACKS_PATH, packName);
            const metaPath = path.join(packPath, 'meta.json');
            let mcVersion = '1.20.1';
            let loader = 'fabric';
            if (await fs.pathExists(metaPath)) {
              const meta = await fs.readJson(metaPath);
              if (meta.version && meta.version !== 'unknown') mcVersion = meta.version;
              if (meta.loader) loader = meta.loader.toLowerCase();
              if (loader === 'kingmodloader') loader = 'forge';
            }
            if (loader === 'vanilla') {
              return { success: false, error: 'Cannot install mods to a Vanilla pack' };
            }
            const slugMatch = url.match(/modrinth\.com\/(mod|resourcepack|shader)\/([^\/?#]+)/i);
            const projectType = slugMatch ? slugMatch[1] : 'mod';
            const slug = slugMatch ? slugMatch[2] : null;
            if (!slug) return { success: false, error: 'Could not parse Modrinth project slug' };
            const projRes = await axios.get(`https://api.modrinth.com/v2/project/${slug}`);
            const projectId = projRes.data?.id;
            if (!projectId) return { success: false, error: 'Modrinth project not found' };
            const versionsRes = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`, {
              params: {
                loaders: `["${loader}"]`,
                game_versions: `["${mcVersion}"]`
              }
            });
            const versions = versionsRes.data;
            if (!versions || versions.length === 0) {
              return { success: false, error: `No compatible version found for ${mcVersion} (${loader})` };
            }
            const targetVersion = versions[0];
            const file = targetVersion.files.find((f: any) => f.primary) || targetVersion.files[0];
            if (!file) return { success: false, error: 'No file found' };
            let targetFolder = 'mods';
            if (projectType === 'resourcepack') targetFolder = 'resourcepacks';
            if (projectType === 'shader') targetFolder = 'shaderpacks';
            const downloadDir = path.join(packPath, targetFolder);
            await fs.ensureDir(downloadDir);
            const downloadPath = path.join(downloadDir, file.filename);
            const response = await axios({ method: 'get', url: file.url, responseType: 'stream' });
            const writer = fs.createWriteStream(downloadPath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
              writer.on('finish', () => resolve(true));
              writer.on('error', reject);
            });
            if (mainWindow) mainWindow.webContents.send('pack-updated', { packName });
            return { success: true };
        } else if (url.includes('curseforge.com')) {
            if (!packName) return { success: false, error: 'Target mod pack not specified' };
            const packPath = path.join(MOD_PACKS_PATH, packName);
            const metaPath = path.join(packPath, 'meta.json');
            if (await fs.pathExists(metaPath)) {
              const meta = await fs.readJson(metaPath);
              const loader = String(meta.loader || '').toLowerCase();
              if (loader === 'vanilla') {
                return { success: false, error: 'Cannot install mods to a Vanilla pack' };
              }
            }
            // Expect a direct file download URL (files/<id>/download or /download/<id>)
            if (!/\/download\//i.test(url) && !/\/files\/\d+\/download/i.test(url)) {
              return { success: false, error: 'Please use a CurseForge file download URL' };
            }
            const modsDir = path.join(packPath, 'mods');
            await fs.ensureDir(modsDir);
            const head = await axios.get(url, { maxRedirects: 5, responseType: 'stream' });
            // Try to extract filename from headers or final URL
            const cd = head.headers['content-disposition'];
            let filename = 'downloaded.jar';
            if (cd) {
              const m = /filename="?([^"]+)"?/i.exec(cd);
              if (m) filename = m[1];
            } else {
              const finalUrl = head.request?.res?.responseUrl || url;
              const clean = finalUrl.split('?')[0];
              filename = path.basename(clean);
            }
            if (!filename.toLowerCase().endsWith('.jar')) filename = filename + '.jar';
            const downloadPath = path.join(modsDir, filename);
            const writer = fs.createWriteStream(downloadPath);
            head.data.pipe(writer);
            await new Promise((resolve, reject) => {
              writer.on('finish', () => resolve(true));
              writer.on('error', reject);
            });
            if (mainWindow) mainWindow.webContents.send('pack-updated', { packName });
            return { success: true };
        }
        return { success: false, error: 'Unsupported URL for direct install' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('open-pack-folder', async (_, packName) => {
  const packPath = path.join(MOD_PACKS_PATH, packName);
  await shell.openPath(packPath);
});

ipcMain.handle('get-pack-files', async (_, packName) => {
  const packPath = path.join(MOD_PACKS_PATH, packName);
  const files: string[] = [];
  
  async function traverse(dir: string, base: string) {
    const list = await fs.readdir(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const relativePath = path.relative(base, fullPath);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await traverse(fullPath, base);
      } else {
        files.push(relativePath);
      }
    }
  }
  
  if (await fs.pathExists(packPath)) {
    await traverse(packPath, packPath);
  }
  return files;
});

ipcMain.handle('update-from-astro', async (_, packName) => {
  try {
    const packPath = path.join(MOD_PACKS_PATH, packName);
    const metaPath = path.join(packPath, 'meta.json');
    if (!await fs.pathExists(metaPath)) return { success: false, error: 'No meta.json found for pack' };
    const meta = await fs.readJson(metaPath);
    const src = String(meta.source || '');
    const match = src.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return { success: false, error: 'Pack source is not a GitHub repository' };
    const [, owner, repo] = match;
    const apiHeaders = { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'aiom-launcher' } };
    let branch = 'main';
    try {
      const repoRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, apiHeaders);
      branch = repoRes.data?.default_branch || 'main';
    } catch {}
    async function fetchContents(p: string): Promise<any[]> {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${branch}`;
      const res = await axios.get(url, apiHeaders).catch(() => ({ data: [] }));
      return Array.isArray(res.data) ? res.data : [];
    }
    async function collectFiles(base: string): Promise<{ path: string; download_url: string }[]> {
      const items = await fetchContents(base);
      const out: { path: string; download_url: string }[] = [];
      for (const it of items) {
        if (it.type === 'file') {
          out.push({ path: it.path, download_url: it.download_url });
        } else if (it.type === 'dir') {
          const sub = await collectFiles(it.path);
          out.push(...sub);
        }
      }
      return out;
    }
    const rootItems = await fetchContents('');
    if (rootItems.length === 0) return { success: false, error: 'Repository appears empty' };
    const allFiles = await collectFiles('');
    const excludeRegex = /(sources|source|javadoc|dev|test|example|installer)/i;
    const total = allFiles.length;
    let done = 0;
    for (const file of allFiles) {
      const rel = file.path;
      let target: string | null = null;
      const lower = rel.toLowerCase();
      if (lower.includes('/mods/') || lower.includes('\\mods\\') || lower.startsWith('mods/')) {
        if (!lower.endsWith('.jar') || excludeRegex.test(lower)) {
          continue;
        }
        const idx = lower.indexOf('/mods/') !== -1 ? lower.indexOf('/mods/') : (lower.indexOf('\\mods\\') !== -1 ? lower.indexOf('\\mods\\') : 0);
        const after = idx > 0 ? rel.substring(idx + 6) : rel.substring(5);
        const base = after.split(/[\\/]/).pop() || after;
        target = path.join(packPath, 'mods', base);
      } else if (lower.includes('/resourcepacks/') || lower.includes('\\resourcepacks\\') || lower.startsWith('resourcepacks/')) {
        const idx = lower.indexOf('/resourcepacks/') !== -1 ? lower.indexOf('/resourcepacks/') : (lower.indexOf('\\resourcepacks\\') !== -1 ? lower.indexOf('\\resourcepacks\\') : 0);
        const after = idx > 0 ? rel.substring(idx + 14) : rel.substring(13);
        const base = after.split(/[\\/]/).pop() || after;
        target = path.join(packPath, 'resourcepacks', base);
      } else if (lower.includes('/shaderpacks/') || lower.includes('\\shaderpacks\\') || lower.startsWith('shaderpacks/')) {
        const idx = lower.indexOf('/shaderpacks/') !== -1 ? lower.indexOf('/shaderpacks/') : (lower.indexOf('\\shaderpacks\\') !== -1 ? lower.indexOf('\\shaderpacks\\') : 0);
        const after = idx > 0 ? rel.substring(idx + 12) : rel.substring(11);
        const base = after.split(/[\\/]/).pop() || after;
        target = path.join(packPath, 'shaderpacks', base);
      } else if (lower.includes('/config/') || lower.includes('\\config\\') || lower.startsWith('config/')) {
        const idx = lower.indexOf('/config/') !== -1 ? lower.indexOf('/config/') : (lower.indexOf('\\config\\') !== -1 ? lower.indexOf('\\config\\') : 0);
        const after = idx > 0 ? rel.substring(idx + 7) : rel.substring(7);
        target = path.join(packPath, 'config', after.replace(/^[\\/]/, ''));
      } else {
        target = path.join(packPath, rel);
      }
      if (!target) continue;
      await fs.ensureDir(path.dirname(target));
      const res = await axios({ method: 'get', url: file.download_url, responseType: 'arraybuffer' }).catch(() => null);
      if (res && res.data) {
        await fs.writeFile(target, res.data);
      }
      done += 1;
      if (mainWindow) mainWindow.webContents.send('update-progress', { packName, percent: done / total, file: rel });
    }
    if (mainWindow) mainWindow.webContents.send('pack-updated', { packName });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-installed-mods', async (_, packName) => {
  try {
    const packPath = path.join(MOD_PACKS_PATH, packName);
    const list: { name: string; size: number }[] = [];
    async function collectJars(dir: string) {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          await collectJars(full);
        } else if (entry.toLowerCase().endsWith('.jar')) {
          list.push({ name: entry, size: stat.size });
        }
      }
    }
    if (await fs.pathExists(packPath)) {
      await collectJars(packPath);
    }
    return list;
  } catch (e) {
    return [];
  }
});
ipcMain.handle('export-pack', async (_, packName, files) => {
  try {
    const packPath = path.join(MOD_PACKS_PATH, packName);
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Mod Pack',
      defaultPath: `${packName}.aiompack`,
      filters: [{ name: 'AIOM Pack', extensions: ['aiompack'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled' };

    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        resolve({ success: true, path: filePath });
      });

      archive.on('error', (err: any) => {
        reject({ success: false, error: err.message });
      });

      archive.pipe(output);

      for (const file of files) {
        const fullPath = path.join(packPath, file);
        archive.file(fullPath, { name: file });
      }

      archive.finalize();
    });

  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// --- KingModLoader Support ---

ipcMain.handle('fetch-king-versions', async () => {
  try {
    const response = await axios.get('https://api.github.com/repos/kingyorkson/KingModLoader/contents/VLibs', { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'aiom-launcher' } });
    const files = response.data;
    
    if (!Array.isArray(files)) return [];

    const versions: any[] = [];

    for (const file of files) {
      if (file.type === 'dir') {
        versions.push({ id: file.name, type: 'release', url: file.html_url, name: file.name });
      }
    }
    
    // Deduplicate
    return versions.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
    
  } catch (error: any) {
    console.error('Error fetching King versions:', error);
    return [];
  }
});

ipcMain.handle('fetch-king-mods', async (_, version) => {
  try {
    if (!version) {
      const vRes = await axios.get('https://api.github.com/repos/kingyorkson/KingModLoader/contents/VLibs', { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'aiom-launcher' } });
      const vFiles = vRes.data;
      if (Array.isArray(vFiles)) {
        const dir = vFiles.find((x: any) => x.type === 'dir');
        if (dir) version = dir.name;
      }
    }
    const headers = { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'aiom-launcher', 'Cache-Control': 'no-cache' } };
    const listDir = async (dirPath: string) => {
      const url = `https://api.github.com/repos/kingyorkson/KingModLoader/contents/${dirPath}?t=${Date.now()}`;
      const res = await axios.get(url, headers);
      return res.data;
    };
    const getFileMeta = async (relPath: string) => {
      const url = `https://api.github.com/repos/kingyorkson/KingModLoader/contents/${relPath}?t=${Date.now()}`;
      const res = await axios.get(url, headers);
      return res.data;
    };
    const resolveDownloadUrl = async (loc: string): Promise<string | null> => {
      const l = String(loc || '').trim();
      if (!l) return null;
      if (/^https?:\/\//i.test(l)) return l;
      let normalized = l.replace('{version}', String(version));
      normalized = normalized.replace(/^[\\/]+/, '');
      const candidates = [
        `ModsLibs/${version}/${normalized}`,
        `VLibs/${version}/${normalized}`
      ];
      for (const cand of candidates) {
        try {
          const meta = await getFileMeta(cand);
          if (meta && meta.download_url) return meta.download_url;
        } catch {}
      }
      return null;
    };
    const modsDataDirCandidates = [
      `ModsLibs/${version}/data`,
      `ModsLibs/${version}`,
      `VLibs/${version}/data`,
      `VLibs/${version}`
    ];
    let mods: any[] = [];
    for (const dir of modsDataDirCandidates) {
      try {
        const collect = async (base: string, depth: number) => {
          const entries = await listDir(base);
          if (!Array.isArray(entries) || entries.length === 0) return;
          for (const entry of entries) {
            const lower = String(entry.name).toLowerCase();
            if (entry.type === 'dir' && depth > 0) {
              await collect(`${base}/${entry.name}`, depth - 1);
            } else if (entry.type === 'file' && lower.endsWith('.txt')) {
              try {
                const contentResp = await axios.get(entry.download_url, { headers: { 'User-Agent': 'aiom-launcher' } });
                const text = String(contentResp.data || '');
                const fields: any = {};
                const lines = text.split(/\r?\n/);
                for (const ln of lines) {
                  const m = ln.match(/^\s*([A-Za-z0-9_]+)\s*[:=]\s*(.+)\s*$/);
                  if (m) {
                    const key = m[1].trim().toLowerCase();
                    const val = m[2].trim();
                    fields[key] = val;
                  }
                }
                const nameField = fields.name || fields.title || path.basename(entry.name, path.extname(entry.name));
                const authorField = fields.developer || fields.author || '';
                const descField = fields.description || fields.summary || '';
                const locationField = fields.location || fields.jar || fields.file || fields.path || '';
                const iconField = fields.icon || fields.iconpath || '';
                const dl = await resolveDownloadUrl(locationField);
                if (!dl) continue;
                const iconUrl = await resolveDownloadUrl(iconField);
                mods.push({
                  id: nameField || entry.name,
                  name: nameField || path.basename(entry.name, path.extname(entry.name)),
                  description: descField,
                  author: authorField,
                  url: dl,
                  icon_url: iconUrl || '',
                  size: 0
                });
              } catch {}
            }
          }
        };
        await collect(dir, 3);
        if (mods.length > 0) break;
      } catch {}
    }
    if (mods.length === 0) {
      // keep legacy fallback if no metadata found
      // (deprecated branch retained for safety)
    }
    // Always list jar files under ModsLibs/<version> (preferred) and include any not already present
    try {
      const seen = new Set<string>(mods.map(m => String(m.id || m.name).toLowerCase()));
      const addJarModsFrom = async (base: string, depth: number) => {
        const entries = await listDir(base);
        if (!Array.isArray(entries) || entries.length === 0) return;
        for (const entry of entries) {
          const lower = String(entry.name).toLowerCase();
          if (entry.type === 'dir' && depth > 0) {
            await addJarModsFrom(`${base}/${entry.name}`, depth - 1);
          } else if (entry.type === 'file' && lower.endsWith('.jar')) {
            const baseName = path.basename(entry.name, path.extname(entry.name));
            const key = (baseName || entry.name).toLowerCase();
            if (seen.has(key)) continue;
            mods.push({
              id: entry.name,
              name: baseName,
              description: '',
              author: '',
              url: entry.download_url,
              icon_url: '',
              size: entry.size || 0
            });
            seen.add(key);
          }
        }
      };
      await addJarModsFrom(`ModsLibs/${version}`, 3);
    } catch {}
    // Optionally include jars from VLibs/<version> if ModsLibs has none
    if (!mods || mods.length === 0) {
      try {
        const seen = new Set<string>();
        const addJarModsFrom = async (base: string, depth: number) => {
          const entries = await listDir(base);
          if (!Array.isArray(entries) || entries.length === 0) return;
          for (const entry of entries) {
            const lower = String(entry.name).toLowerCase();
            if (entry.type === 'dir' && depth > 0) {
              await addJarModsFrom(`${base}/${entry.name}`, depth - 1);
            } else if (entry.type === 'file' && lower.endsWith('.jar')) {
              const baseName = path.basename(entry.name, path.extname(entry.name));
              const key = (baseName || entry.name).toLowerCase();
              if (seen.has(key)) continue;
              mods.push({
                id: entry.name,
                name: baseName,
                description: '',
                author: '',
                url: entry.download_url,
                icon_url: '',
                size: entry.size || 0
              });
              seen.add(key);
            }
          }
        };
        await addJarModsFrom(`VLibs/${version}`, 2);
      } catch {}
    }
    return mods;
  } catch (error: any) {
    console.error(`Error fetching King mods for version ${version}:`, error);
    return [];
  }
});

ipcMain.handle('update-discord-presence', (_, details, state) => {
  setDiscordActivity(details, state);
});

ipcMain.handle('install-king-mod', async (_, packName, modUrl, modName) => {
  try {
    const packPath = path.join(MOD_PACKS_PATH, packName);
    const modsDir = path.join(packPath, 'mods');
    await fs.ensureDir(modsDir);
    
    const metaPath = path.join(packPath, 'meta.json');
    if (await fs.pathExists(metaPath)) {
      const meta = await fs.readJson(metaPath);
      const loader = String(meta.loader || '').toLowerCase();
      if (loader === 'vanilla') {
        return { success: false, error: 'Cannot install mods to a Vanilla pack' };
      }
    }
    
    if (!String(modUrl).toLowerCase().endsWith('.jar')) {
      return { success: false, error: 'Only .jar mods are supported for King packs' };
    }
    
    const baseName = path.basename(modName, path.extname(modName));
    const fileName = `${baseName}.jar`;

    const dest = path.join(modsDir, fileName);
    
    const response = await axios({
        method: 'get',
        url: modUrl,
        responseType: 'stream'
    });

    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', () => {
          if (mainWindow) mainWindow.webContents.send('pack-updated', { packName });
          resolve(true);
        });
        writer.on('error', reject);
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// --- Global Settings ---

ipcMain.handle('get-global-config', async () => {
  return await getGlobalOptions();
});

ipcMain.handle('save-global-config', async (_, config) => {
  try {
    await fs.writeJson(GLOBAL_CONFIG_FILE, config, { spaces: 2 });
    return true;
  } catch (error) {
    console.error('Error saving global config:', error);
    return false;
  }
});

// --- Browse ---



ipcMain.handle('select-skin-file', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Select Skin File',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    properties: ['openFile']
  });
  
  if (filePaths && filePaths.length > 0) {
    return filePaths[0];
  }
  return null;
});

ipcMain.handle('save-skin', async (_, srcPath: string) => {
  try {
    if (!srcPath || !(await fs.pathExists(srcPath))) return { success: false, error: 'File not found' };
    const skinsDir = path.join(APP_DATA_PATH, 'skins');
    await fs.ensureDir(skinsDir);
    const base = path.basename(srcPath).replace(/[^\w\-.]+/g, '_');
    const dest = path.join(skinsDir, base);
    await fs.copy(srcPath, dest, { overwrite: true });
    return { success: true, path: dest, name: base };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('list-skins', async () => {
  try {
    const skinsDir = path.join(APP_DATA_PATH, 'skins');
    await fs.ensureDir(skinsDir);
    const items = await fs.readdir(skinsDir);
    const skins = [];
    for (const it of items) {
      const full = path.join(skinsDir, it);
      const stat = await fs.stat(full);
      if (stat.isFile() && it.toLowerCase().endsWith('.png')) {
        skins.push({ name: it, path: full, size: stat.size });
      }
    }
    return skins;
  } catch {
    return [];
  }
});
ipcMain.handle('assign-account-skin', async (_, accountId: string, skinPath: string) => {
  try {
    const cfg = await getGlobalOptions();
    if (!Array.isArray(cfg.accounts)) cfg.accounts = [];
    const idx = cfg.accounts.findIndex((a: any) => a.id === accountId);
    if (idx >= 0) {
      cfg.accounts[idx].skinPath = skinPath;
      await fs.writeJson(GLOBAL_CONFIG_FILE, cfg, { spaces: 2 });
      try {
        const packs = await fs.readdir(MOD_PACKS_PATH);
        for (const pack of packs) {
          const packPath = path.join(MOD_PACKS_PATH, pack);
          const stat = await fs.stat(packPath).catch(() => null);
          if (stat && stat.isDirectory()) {
            const metaPath = path.join(packPath, 'meta.json');
            let loader = 'unknown';
            let version = 'unknown';
            if (await fs.pathExists(metaPath)) {
              const meta = await fs.readJson(metaPath).catch(() => ({}));
              loader = String(meta.loader || 'unknown').toLowerCase();
              version = String(meta.version || 'unknown');
            }
            
            // Pass the resolved version to ensure the pack format is correct for this specific modpack
            if (version && version !== 'unknown') {
               // Try to resolve 1.20 to 1.20.1 etc if needed, but getPackFormat handles simple strings well
               await ensureAccountSkinOverlay(packPath, skinPath, version);
            } else {
               // Fallback to 1.20.1 if unknown, which is format 15
               await ensureAccountSkinOverlay(packPath, skinPath, '1.20.1');
            }
            
            const accName = String(cfg.accounts[idx].name || 'Player');
            await ensureCustomSkinLoader(packPath, accName, version, loader, skinPath);
          }
        }
      } catch {}
      return { success: true };
    }
    return { success: false, error: 'Account not found' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('install-java', async (_, major: number) => {
  try {
    const zulu = await ensureZuluJava(major);
    if (zulu) return { success: true, path: zulu, vendor: 'zulu' };
    const temurin = await ensureTemurinJava(major);
    if (temurin) return { success: true, path: temurin, vendor: 'temurin' };
    return { success: false, error: 'Failed to install Java' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

const minecraftProcesses = new Map<string, any>(); // id -> child process

ipcMain.handle('stop-minecraft', async (_, processId: string) => {
  try {
    const proc = runningProcesses.get(processId);
    if (!proc) return { success: false };
    const child = minecraftProcesses.get(processId);
    if (child) {
      try {
        if (IS_WIN) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        } else {
          try { child.kill('SIGTERM'); } catch {}
          setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 3000);
        }
      } catch {}
      minecraftProcesses.delete(processId);
    }
    proc.status = 'stopped';
    processLogs.set(processId, [...(processLogs.get(processId) || []), '[Process stopped by user]']);
    broadcastProcesses();
    setTimeout(() => {
      runningProcesses.delete(processId);
      processLogs.delete(processId);
      broadcastProcesses();
    }, 2000);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-running-processes', async () => {
  const procs = Array.from(runningProcesses.values()).map((p: any) => ({
    id: p.id,
    packName: p.packName,
    status: p.status,
    pid: p.pid,
    startedAt: p.startedAt,
    logs: (processLogs.get(p.id) || []).slice(-200)
  }));
  return procs;
});

ipcMain.handle('get-java-path', async () => {
  const cfg = await getGlobalOptions();
  return cfg.javaPath || null;
});

ipcMain.handle('set-java-path', async (_, javaPath: string) => {
  try {
    if (!javaPath) return false;
    if (!await fs.pathExists(javaPath)) return false;
    const cfg = await getGlobalOptions();
    cfg.javaPath = javaPath;
    await fs.writeJson(GLOBAL_CONFIG_FILE, cfg, { spaces: 2 });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('select-java-binary', async () => {
  const filters = IS_WIN
    ? [{ name: 'Executable', extensions: ['exe'] }]
    : [{ name: 'All Files', extensions: ['*'] }];
  const { filePaths } = await dialog.showOpenDialog({
    title: IS_WIN ? 'Select java.exe' : 'Select java executable',
    filters,
    properties: ['openFile']
  });
  if (filePaths && filePaths.length > 0) {
    return filePaths[0];
  }
  return null;
});
