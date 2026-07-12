import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as vscode from 'vscode';

export type QpmQtToolchainCompatibility = 'compatible' | 'unknown' | 'incompatible';
export type QpmQtDesignerLauncherKind = 'designer' | 'qtcreator';

export interface QpmQtDesignerLauncher {
  path: string;
  kind: QpmQtDesignerLauncherKind;
  source: 'configured' | 'qt-kit' | 'qt-tools' | 'path';
}

export interface QpmQtToolchain {
  family: 'mingw' | 'msvc' | 'clang' | 'gcc' | 'emscripten' | 'unknown';
  architecture: string;
  detectedArchitecture?: string;
  targetTriple?: string;
  compilerVersion?: string;
  compatibility: QpmQtToolchainCompatibility;
  diagnostic?: string;
  binDir?: string;
  cCompilerPath?: string;
  cppCompilerPath?: string;
  archiverPath?: string;
  debuggerPath?: string;
  makePath?: string;
  environmentScript?: string;
  source: 'qt-override' | 'configured' | 'qt-tools' | 'path' | 'unresolved';
}

export interface QpmQtInstallation {
  id: string;
  label: string;
  root: string;
  version: string;
  majorVersion: number;
  architecture: string;
  compilerFamily: 'mingw' | 'msvc' | 'clang' | 'gcc' | 'emscripten' | 'unknown';
  binDir: string;
  includeDir: string;
  libDir: string;
  pluginsDir?: string;
  qmlDir?: string;
  mkspecsDir?: string;
  qmakePath?: string;
  cmakePath?: string;
  ninjaPath?: string;
  jomPath?: string;
  nmakePath?: string;
  vcVarsPath?: string;
  qtPathsPath?: string;
  mocPath?: string;
  uicPath?: string;
  rccPath?: string;
  designerPath?: string;
  designerLauncherKind?: QpmQtDesignerLauncherKind;
  designerSource?: QpmQtDesignerLauncher['source'];
  linguistPath?: string;
  lupdatePath?: string;
  lreleasePath?: string;
  qmlLintPath?: string;
  qmlFormatPath?: string;
  qmlRuntimePath?: string;
  qmlScenePath?: string;
  assistantPath?: string;
  deployToolPath?: string;
  androidDeployQtPath?: string;
  androidAbi?: string;
  isAndroid?: boolean;
  toolchain: QpmQtToolchain;
}

const SECTION = 'qpm';

type QtCompilerFamily = QpmQtInstallation['compilerFamily'];

interface CompilerProbe {
  family: QpmQtToolchain['family'];
  architecture: string;
  targetTriple?: string;
  compilerVersion?: string;
}

function executableName(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function existingFile(directory: string, names: string[]): string | undefined {
  for (const name of names) {
    const candidate = path.join(directory, process.platform === 'win32' && !name.toLowerCase().endsWith('.exe') ? executableName(name) : name);
    if (isFile(candidate)) return candidate;
  }
  return undefined;
}

function isFile(candidate: string | undefined): candidate is string {
  if (!candidate) return false;
  try { return fs.statSync(candidate).isFile(); } catch { return false; }
}

function firstExistingFile(candidates: string[]): string | undefined {
  for (const candidate of uniquePaths(candidates)) {
    if (isFile(candidate)) return candidate;
  }
  return undefined;
}

function executableCandidates(directory: string, baseName: string): string[] {
  return process.platform === 'win32'
    ? [path.join(directory, `${baseName}.exe`), path.join(directory, baseName)]
    : [path.join(directory, baseName), path.join(directory, `${baseName}.exe`)];
}

function designerLauncherKind(executablePath: string): QpmQtDesignerLauncherKind | undefined {
  const name = path.basename(executablePath).toLowerCase().replace(/\.exe$/, '');
  if (name === 'designer' || name.endsWith('-designer')) return 'designer';
  if (name === 'qtcreator') return 'qtcreator';
  return undefined;
}

export function discoverQtDesignerLauncher(qtRoot: string, configuredPath?: string): QpmQtDesignerLauncher | undefined {
  const configured = (configuredPath ?? vscode.workspace.getConfiguration(SECTION).get<string>('qtDesignerPath', '')).trim();
  if (isFile(configured)) {
    const kind = designerLauncherKind(configured);
    if (kind) return { path: path.normalize(configured), kind, source: 'configured' };
  }

  const normalizedRoot = path.normalize(qtRoot);
  const directDesigner = firstExistingFile(executableCandidates(path.join(normalizedRoot, 'bin'), 'designer'));
  if (directDesigner) return { path: directDesigner, kind: 'designer', source: 'qt-kit' };

  const ancestors: string[] = [];
  let current = normalizedRoot;
  for (let depth = 0; depth < 6; depth += 1) {
    ancestors.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const designerCandidates: string[] = [];
  const creatorCandidates: string[] = [];
  for (const ancestor of ancestors) {
    const toolsRoot = path.join(ancestor, 'Tools');
    designerCandidates.push(...executableCandidates(path.join(toolsRoot, 'QtCreator', 'bin'), 'designer'));
    creatorCandidates.push(...executableCandidates(path.join(toolsRoot, 'QtCreator', 'bin'), 'qtcreator'));

    for (const entry of safeReadDirectories(toolsRoot)) {
      const toolRoot = path.join(toolsRoot, entry.name);
      designerCandidates.push(...executableCandidates(path.join(toolRoot, 'bin'), 'designer'));
      creatorCandidates.push(...executableCandidates(path.join(toolRoot, 'bin'), 'qtcreator'));
      for (const child of safeReadDirectories(toolRoot)) {
        designerCandidates.push(...executableCandidates(path.join(toolRoot, child.name, 'bin'), 'designer'));
        creatorCandidates.push(...executableCandidates(path.join(toolRoot, child.name, 'bin'), 'qtcreator'));
      }
    }

    for (const entry of safeReadDirectories(ancestor)) {
      designerCandidates.push(...executableCandidates(path.join(ancestor, entry.name, 'bin'), 'designer'));
    }
  }

  const toolsDesigner = firstExistingFile(designerCandidates);
  if (toolsDesigner) return { path: toolsDesigner, kind: 'designer', source: 'qt-tools' };
  const toolsQtCreator = firstExistingFile(creatorCandidates);
  if (toolsQtCreator) return { path: toolsQtCreator, kind: 'qtcreator', source: 'qt-tools' };

  const pathDesigner = findExecutableOnPath('designer');
  if (pathDesigner) return { path: pathDesigner, kind: 'designer', source: 'path' };
  const pathQtCreator = findExecutableOnPath('qtcreator');
  if (pathQtCreator) return { path: pathQtCreator, kind: 'qtcreator', source: 'path' };
  return undefined;
}

function isDirectory(candidate: string | undefined): candidate is string {
  if (!candidate) return false;
  try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
}

function detectCompilerFamily(root: string): QtCompilerFamily {
  const value = root.toLowerCase();
  if (/(?:^|[\\/])android_(?:arm64_v8a|armv7|x86|x86_64)(?:[\\/]|$)/.test(value)) return 'clang';
  if (value.includes('mingw')) return 'mingw';
  if (value.includes('msvc')) return 'msvc';
  if (value.includes('wasm') || value.includes('emscripten')) return 'emscripten';
  if (value.includes('clang')) return 'clang';
  if (value.includes('gcc')) return 'gcc';
  return 'unknown';
}

function detectArchitecture(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('arm64') || lower.includes('aarch64')) return 'arm64';
  if (lower.includes('x86_64') || lower.includes('amd64')) return 'x64';
  if (lower.includes('i686') || lower.includes('i586') || lower.includes('i386')) return 'x86';
  if (/(^|[_\\/.-])(64|x64)([_\\/.-]|$)/.test(lower)) return 'x64';
  if (/(^|[_\\/.-])(32|x86)([_\\/.-]|$)/.test(lower) || /(?:^|[\\/])mingw32(?:[\\/]|$)/.test(lower)) return 'x86';
  if (lower.trim() === 'mingw32') return 'x86';
  return 'unknown';
}

function detectAndroidAbi(root: string): string | undefined {
  const value = root.toLowerCase();
  if (value.includes('android_arm64_v8a')) return 'arm64-v8a';
  if (value.includes('android_armv7')) return 'armeabi-v7a';
  if (value.includes('android_x86_64')) return 'x86_64';
  if (value.includes('android_x86')) return 'x86';
  return undefined;
}

function versionFromRoot(root: string): string {
  const parts = path.normalize(root).split(path.sep).reverse();
  return parts.find((part) => /^\d+\.\d+(?:\.\d+)?$/.test(part)) ?? queryVersionFromTool(root) ?? 'unknown';
}

function queryVersionFromTool(root: string): string | undefined {
  const tool = existingFile(path.join(root, 'bin'), ['qtpaths6', 'qtpaths', 'qmake6', 'qmake']);
  if (!tool) return undefined;
  try {
    const output = path.basename(tool).toLowerCase().startsWith('qmake')
      ? execFileSync(tool, ['-query', 'QT_VERSION'], { encoding: 'utf8', windowsHide: true, timeout: 2500 })
      : execFileSync(tool, ['--qt-version'], { encoding: 'utf8', windowsHide: true, timeout: 2500 });
    return output.trim().match(/\d+\.\d+(?:\.\d+)?/)?.[0];
  } catch {
    return undefined;
  }
}

interface QpmQtBuildTools {
  cmakePath?: string;
  ninjaPath?: string;
  jomPath?: string;
  nmakePath?: string;
  vcVarsPath?: string;
}

function discoverQtBuildTools(qtRoot: string): QpmQtBuildTools {
  const candidates: string[] = [];
  let current = path.normalize(qtRoot);
  for (let depth = 0; depth < 7; depth += 1) {
    candidates.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const cmake: string[] = [];
  const ninja: string[] = [];
  const jom: string[] = [];
  for (const base of candidates) {
    const tools = path.join(base, 'Tools');
    cmake.push(...executableCandidates(path.join(tools, 'CMake_64', 'bin'), 'cmake'));
    ninja.push(...executableCandidates(path.join(tools, 'Ninja'), 'ninja'));
    ninja.push(...executableCandidates(path.join(tools, 'Ninja', 'bin'), 'ninja'));
    jom.push(...executableCandidates(path.join(tools, 'QtCreator', 'bin'), 'jom'));
    ninja.push(...executableCandidates(path.join(tools, 'QtCreator', 'bin'), 'ninja'));
    for (const entry of safeReadDirectories(tools)) {
      const toolRoot = path.join(tools, entry.name);
      if (/cmake/i.test(entry.name)) cmake.push(...executableCandidates(path.join(toolRoot, 'bin'), 'cmake'));
      if (/ninja/i.test(entry.name)) {
        ninja.push(...executableCandidates(toolRoot, 'ninja'));
        ninja.push(...executableCandidates(path.join(toolRoot, 'bin'), 'ninja'));
      }
      if (/jom/i.test(entry.name)) {
        jom.push(...executableCandidates(toolRoot, 'jom'));
        jom.push(...executableCandidates(path.join(toolRoot, 'bin'), 'jom'));
      }
    }
  }
  const vcVarsPath = process.platform === 'win32' ? discoverVisualStudioEnvironmentScript() : undefined;
  return {
    cmakePath: firstExistingFile(cmake) ?? findExecutableOnPath('cmake'),
    ninjaPath: firstExistingFile(ninja) ?? findExecutableOnPath('ninja'),
    jomPath: firstExistingFile(jom) ?? findExecutableOnPath('jom'),
    nmakePath: findExecutableOnPath('nmake'),
    vcVarsPath
  };
}

function discoverVisualStudioEnvironmentScript(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswhere = path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (isFile(vswhere)) {
    try {
      const installation = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true, timeout: 4000 }).trim();
      const candidate = path.join(installation, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
      if (isFile(candidate)) return candidate;
    } catch { /* fallback below */ }
  }
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((entry): entry is string => !!entry);
  for (const root of roots) {
    const vsRoot = path.join(root, 'Microsoft Visual Studio');
    for (const year of safeReadDirectories(vsRoot).sort((a,b) => b.name.localeCompare(a.name))) {
      for (const edition of safeReadDirectories(path.join(vsRoot, year.name))) {
        const candidate = path.join(vsRoot, year.name, edition.name, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
        if (isFile(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

export function describeQtRoot(root: string): QpmQtInstallation | undefined {
  const normalized = path.normalize(root);
  const binDir = path.join(normalized, 'bin');
  const includeDir = path.join(normalized, 'include');
  const libDir = path.join(normalized, 'lib');
  if (!isDirectory(binDir) || !isDirectory(includeDir) || !isDirectory(libDir)) return undefined;

  const qmakePath = existingFile(binDir, ['qmake6', 'qmake']);
  const qtPathsPath = existingFile(binDir, ['qtpaths6', 'qtpaths']);
  const mocPath = existingFile(binDir, ['moc', 'moc6']);
  const uicPath = existingFile(binDir, ['uic', 'uic6']);
  const rccPath = existingFile(binDir, ['rcc', 'rcc6']);
  if (!qmakePath && !qtPathsPath && (!mocPath || !uicPath || !rccPath)) return undefined;

  const version = versionFromRoot(normalized);
  const majorVersion = Number(version.split('.')[0]) || 0;
  const compilerFamily = detectCompilerFamily(normalized);
  const androidAbi = detectAndroidAbi(normalized);
  const isAndroid = !!androidAbi;
  const architecture = detectArchitecture(androidAbi || normalized);
  const folder = path.basename(normalized);
  const buildTools = discoverQtBuildTools(normalized);
  const toolchain = discoverQtToolchain(normalized, compilerFamily, architecture, buildTools.vcVarsPath);
  const designerLauncher = discoverQtDesignerLauncher(normalized);
  return {
    id: `${version}-${folder}`.replace(/[^a-zA-Z0-9_.-]+/g, '-').toLowerCase(),
    label: `Qt ${version} — ${folder} (${compilerFamily}, ${architecture})`,
    root: normalized,
    version,
    majorVersion,
    architecture,
    compilerFamily,
    binDir,
    includeDir,
    libDir,
    pluginsDir: existingDirectory(path.join(normalized, 'plugins')),
    qmlDir: existingDirectory(path.join(normalized, 'qml')),
    mkspecsDir: existingDirectory(path.join(normalized, 'mkspecs')),
    qmakePath,
    cmakePath: buildTools.cmakePath,
    ninjaPath: buildTools.ninjaPath,
    jomPath: buildTools.jomPath,
    nmakePath: buildTools.nmakePath,
    vcVarsPath: buildTools.vcVarsPath,
    qtPathsPath,
    mocPath,
    uicPath,
    rccPath,
    designerPath: designerLauncher?.path,
    designerLauncherKind: designerLauncher?.kind,
    designerSource: designerLauncher?.source,
    linguistPath: existingFile(binDir, ['linguist']),
    lupdatePath: existingFile(binDir, ['lupdate']),
    lreleasePath: existingFile(binDir, ['lrelease']),
    qmlLintPath: existingFile(binDir, ['qmllint']),
    qmlFormatPath: existingFile(binDir, ['qmlformat']),
    qmlRuntimePath: existingFile(binDir, ['qml']),
    qmlScenePath: existingFile(binDir, ['qmlscene']),
    assistantPath: existingFile(binDir, ['assistant']),
    deployToolPath: isAndroid ? existingFile(binDir, ['androiddeployqt']) : existingFile(binDir, process.platform === 'win32' ? ['windeployqt'] : process.platform === 'darwin' ? ['macdeployqt'] : ['linuxdeployqt']),
    androidDeployQtPath: isAndroid ? existingFile(binDir, ['androiddeployqt']) : undefined,
    androidAbi,
    isAndroid,
    toolchain
  };
}

function existingDirectory(candidate: string): string | undefined {
  return isDirectory(candidate) ? candidate : undefined;
}

function discoverQtToolchain(qtRoot: string, family: QtCompilerFamily, architecture: string, vcVarsPath?: string): QpmQtToolchain {
  const config = vscode.workspace.getConfiguration(SECTION);
  const candidates: QpmQtToolchain[] = [];
  const seen = new Set<string>();
  const addCandidate = (candidate: QpmQtToolchain | undefined): void => {
    if (!candidate?.cppCompilerPath && !candidate?.cCompilerPath) return;
    const key = path.normalize(candidate.cppCompilerPath ?? candidate.cCompilerPath ?? '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  const qtOverride = config.get<string>('qtCompilerPath', '').trim();
  if (isFile(qtOverride)) {
    addCandidate(createToolchainFromCompiler(qtOverride, family, architecture, 'qt-override'));
  }

  for (const binDir of qtToolchainCandidateDirectories(qtRoot, family, architecture)) {
    addCandidate(createToolchainFromDirectory(binDir, family, architecture, 'qt-tools'));
  }

  // Generic CPM/QPM compiler settings are only a fallback for a Qt kit. They must
  // never override a compiler installed alongside Qt, and architecture mismatches
  // are rejected instead of being hidden behind -m32/-m64 flags.
  const configuredCpp = config.get<string>('cppCompilerPath', '').trim();
  const configuredC = config.get<string>('cCompilerPath', '').trim();
  if (isFile(configuredCpp) || isFile(configuredC)) {
    const configuredCompiler = isFile(configuredCpp) ? configuredCpp : configuredC;
    addCandidate(createToolchainFromCompiler(configuredCompiler, family, architecture, 'configured'));
  }

  addCandidate(discoverToolchainOnPath(family, architecture));
  if (family === 'msvc' && !candidates.length && vcVarsPath) {
    candidates.push({ family: 'msvc', architecture, detectedArchitecture: architecture, compatibility: 'compatible', diagnostic: `MSVC developer environment: ${vcVarsPath}`, cCompilerPath: 'cl.exe', cppCompilerPath: 'cl.exe', archiverPath: 'lib.exe', debuggerPath: findExecutableOnPath('cdb'), makePath: 'nmake.exe', environmentScript: vcVarsPath, source: 'qt-tools' });
  }

  if (!candidates.length) {
    return {
      family,
      architecture,
      detectedArchitecture: 'unknown',
      compatibility: 'unknown',
      diagnostic: `No compiler was found for the Qt kit ${qtRoot}. Install the Qt-provided toolchain or select its C++ compiler manually.`,
      source: 'unresolved'
    };
  }

  candidates.sort((left, right) => toolchainScore(right, family, architecture) - toolchainScore(left, family, architecture));
  return candidates[0];
}

function createToolchainFromDirectory(
  binDir: string,
  expectedFamily: QtCompilerFamily,
  expectedArchitecture: string,
  source: QpmQtToolchain['source']
): QpmQtToolchain | undefined {
  const cppNames = expectedFamily === 'emscripten' ? ['em++'] : expectedFamily === 'clang' ? ['clang++', 'g++'] : expectedFamily === 'msvc' ? ['cl'] : ['g++', 'clang++'];
  const cppCompilerPath = existingFile(binDir, cppNames);
  const cCompilerPath = existingFile(binDir, expectedFamily === 'emscripten' ? ['emcc'] : expectedFamily === 'clang' ? ['clang', 'gcc'] : expectedFamily === 'msvc' ? ['cl'] : ['gcc', 'clang']);
  if (!cppCompilerPath && !cCompilerPath) return undefined;
  return createToolchainFromCompiler(cppCompilerPath ?? cCompilerPath!, expectedFamily, expectedArchitecture, source, cCompilerPath, cppCompilerPath);
}

function createToolchainFromCompiler(
  compilerPath: string,
  expectedFamily: QtCompilerFamily,
  expectedArchitecture: string,
  source: QpmQtToolchain['source'],
  knownCCompilerPath?: string,
  knownCppCompilerPath?: string
): QpmQtToolchain {
  const binDir = path.dirname(compilerPath);
  const probe = probeCompiler(compilerPath);
  const family = probe.family !== 'unknown' ? probe.family : (inferToolFamily(compilerPath) ?? expectedFamily);
  const detectedArchitecture = probe.architecture !== 'unknown' ? probe.architecture : detectArchitecture(compilerPath);
  const compatibility = determineCompatibility(expectedFamily, expectedArchitecture, family, detectedArchitecture);
  const diagnostic = compatibilityDiagnostic(expectedFamily, expectedArchitecture, family, detectedArchitecture, compilerPath, probe.targetTriple);
  return {
    family,
    architecture: detectedArchitecture !== 'unknown' ? detectedArchitecture : expectedArchitecture,
    detectedArchitecture,
    targetTriple: probe.targetTriple,
    compilerVersion: probe.compilerVersion,
    compatibility,
    diagnostic,
    binDir,
    cCompilerPath: knownCCompilerPath ?? existingFile(binDir, family === 'emscripten' ? ['emcc'] : ['gcc', 'clang', 'cl']),
    cppCompilerPath: knownCppCompilerPath ?? (/[\\/]cl(?:\.exe)?$/i.test(compilerPath) ? compilerPath : existingFile(binDir, ['g++', 'clang++', 'cl']) ?? compilerPath),
    archiverPath: existingFile(binDir, ['ar', 'llvm-ar', 'lib']),
    debuggerPath: existingFile(binDir, ['gdb', 'lldb', 'cdb']),
    makePath: existingFile(binDir, ['mingw32-make', 'make', 'ninja', 'jom', 'nmake']),
    source
  };
}

export function inspectQtCompiler(
  compilerPath: string,
  expectedFamily: QpmQtToolchain['family'] = 'unknown',
  expectedArchitecture = 'unknown'
): QpmQtToolchain {
  return createToolchainFromCompiler(compilerPath, expectedFamily, expectedArchitecture, 'configured');
}

function probeCompiler(compilerPath: string): CompilerProbe {
  let targetTriple: string | undefined;
  let compilerVersion: string | undefined;
  try {
    targetTriple = execFileSync(compilerPath, ['-dumpmachine'], { encoding: 'utf8', windowsHide: true, timeout: 2500 }).trim() || undefined;
  } catch {
    targetTriple = undefined;
  }
  try {
    compilerVersion = execFileSync(compilerPath, ['-dumpfullversion'], { encoding: 'utf8', windowsHide: true, timeout: 2500 }).trim() || undefined;
  } catch {
    compilerVersion = undefined;
  }
  const familyFromTarget = targetTriple?.toLowerCase().includes('mingw') ? 'mingw' : undefined;
  return {
    family: familyFromTarget ?? inferToolFamily(compilerPath) ?? 'unknown',
    architecture: detectArchitecture(targetTriple ?? compilerPath),
    targetTriple,
    compilerVersion
  };
}

function determineCompatibility(
  expectedFamily: QtCompilerFamily,
  expectedArchitecture: string,
  actualFamily: QpmQtToolchain['family'],
  actualArchitecture: string
): QpmQtToolchainCompatibility {
  const familyKnown = expectedFamily !== 'unknown' && actualFamily !== 'unknown';
  const familyCompatible = !familyKnown || expectedFamily === actualFamily;
  const architectureKnown = expectedArchitecture !== 'unknown' && actualArchitecture !== 'unknown';
  if (!familyCompatible || (architectureKnown && expectedArchitecture !== actualArchitecture)) return 'incompatible';
  if (!familyKnown || !architectureKnown) return 'unknown';
  return 'compatible';
}

function compatibilityDiagnostic(
  expectedFamily: QtCompilerFamily,
  expectedArchitecture: string,
  actualFamily: QpmQtToolchain['family'],
  actualArchitecture: string,
  compilerPath: string,
  targetTriple?: string
): string {
  const target = targetTriple ? ` Target: ${targetTriple}.` : '';
  if (expectedArchitecture !== 'unknown' && actualArchitecture !== 'unknown' && expectedArchitecture !== actualArchitecture) {
    return `Compiler architecture mismatch: Qt requires ${expectedArchitecture}, but ${compilerPath} targets ${actualArchitecture}.${target}`;
  }
  if (expectedFamily !== 'unknown' && actualFamily !== 'unknown' && expectedFamily !== actualFamily) {
    return `Compiler ABI mismatch: Qt requires ${expectedFamily}, but ${compilerPath} was detected as ${actualFamily}.${target}`;
  }
  if (actualArchitecture === 'unknown') {
    return `The compiler target architecture could not be verified for ${compilerPath}.${target}`;
  }
  return `Compiler matches the Qt kit (${actualFamily}, ${actualArchitecture}).${target}`;
}

function toolchainScore(toolchain: QpmQtToolchain, expectedFamily: QtCompilerFamily, expectedArchitecture: string): number {
  let score = toolchain.compatibility === 'compatible' ? 100 : toolchain.compatibility === 'unknown' ? 20 : -100;
  if (toolchain.source === 'qt-tools') score += 40;
  else if (toolchain.source === 'qt-override') score += 30;
  else if (toolchain.source === 'configured') score += 5;
  if (toolchain.family === expectedFamily) score += 10;
  if (toolchain.detectedArchitecture === expectedArchitecture) score += 10;
  const pathText = (toolchain.cppCompilerPath ?? '').toLowerCase();
  if (pathText.includes(`${path.sep.toLowerCase()}tools${path.sep.toLowerCase()}`) || /[\\/]tools[\\/]/i.test(pathText)) score += 5;
  return score;
}

function qtToolchainCandidateDirectories(qtRoot: string, family: QtCompilerFamily, architecture: string): string[] {
  const toolsRoots: string[] = [];
  let current = path.normalize(qtRoot);
  for (let depth = 0; depth < 6; depth += 1) {
    const directTools = path.join(current, 'Tools');
    if (isDirectory(directTools)) toolsRoots.push(directTools);
    if (path.basename(current).toLowerCase() === 'tools' && isDirectory(current)) toolsRoots.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const scored: Array<{ path: string; score: number }> = [];
  const addBin = (binDir: string): void => {
    if (!isDirectory(binDir)) return;
    const lower = binDir.toLowerCase();
    let score = 0;
    if (family !== 'unknown' && lower.includes(family === 'msvc' ? 'msvc' : family)) score += 10;
    if (architecture === 'x64' && /(?:64|x64)/.test(lower)) score += 6;
    if (architecture === 'x86' && /(?:32|x86)/.test(lower)) score += 6;
    if (lower.includes('tools')) score += 3;
    scored.push({ path: binDir, score });
  };

  for (const toolsRoot of uniquePaths(toolsRoots)) {
    for (const entry of safeReadDirectories(toolsRoot)) {
      const firstLevel = path.join(toolsRoot, entry.name);
      addBin(path.join(firstLevel, 'bin'));
      for (const child of safeReadDirectories(firstLevel)) {
        addBin(path.join(firstLevel, child.name, 'bin'));
      }
    }
  }
  addBin(path.join(qtRoot, 'bin'));
  return uniquePaths(scored.sort((left, right) => right.score - left.score).map((entry) => entry.path));
}

function safeReadDirectories(directory: string): fs.Dirent[] {
  try { return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()); } catch { return []; }
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = path.normalize(value).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function discoverToolchainOnPath(family: QtCompilerFamily, architecture: string): QpmQtToolchain | undefined {
  const cppNames = family === 'emscripten' ? ['em++'] : family === 'clang' ? ['clang++'] : family === 'msvc' ? ['cl'] : ['g++', 'clang++'];
  for (const name of cppNames) {
    const cppCompilerPath = findExecutableOnPath(name);
    if (!cppCompilerPath) continue;
    return createToolchainFromCompiler(cppCompilerPath, family, architecture, 'path');
  }
  return undefined;
}

function findExecutableOnPath(name: string): string | undefined {
  const candidates = process.platform === 'win32'
    ? [name, `${name}.exe`, `${name}.bat`, `${name}.cmd`]
    : [name];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const executable of candidates) {
      const candidate = path.join(directory.replace(/^"|"$/g, ''), executable);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

function inferToolFamily(toolPath: string | undefined): QpmQtToolchain['family'] | undefined {
  const value = (toolPath ?? '').toLowerCase();
  if (value.includes('mingw')) return 'mingw';
  if (/(^|[\\/])g\+\+(?:\.exe)?$/.test(value)) return 'gcc';
  if (/(^|[\\/])cl(?:\.exe)?$/.test(value) || value.includes('msvc')) return 'msvc';
  if (value.includes('wasm') || value.includes('emscripten')) return 'emscripten';
  if (value.includes('clang')) return 'clang';
  if (value.includes('gcc')) return 'gcc';
  return undefined;
}

function candidateBases(): string[] {
  const configured = vscode.workspace.getConfiguration(SECTION).get<string[]>('qtSearchPaths', []);
  const bases = [...configured];
  if (process.env.QTDIR) bases.push(process.env.QTDIR);
  if (process.platform === 'win32') {
    bases.push('C:\\Qt');
    if (process.env.USERPROFILE) bases.push(path.join(process.env.USERPROFILE, 'Qt'));
  } else {
    bases.push('/opt/Qt', '/opt/qt', '/usr/local/Qt', '/usr/local/qt', path.join(process.env.HOME ?? '', 'Qt'));
  }
  return uniquePaths(bases.filter(Boolean).map((entry) => path.normalize(entry)));
}

function scanBase(base: string): QpmQtInstallation[] {
  if (!isDirectory(base)) return [];
  const results: QpmQtInstallation[] = [];
  const queue: Array<{ directory: string; depth: number }> = [{ directory: base, depth: 0 }];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    const key = path.normalize(current.directory).toLowerCase();
    if (visited.has(key)) continue;
    visited.add(key);
    const installation = describeQtRoot(current.directory);
    if (installation) {
      results.push(installation);
      continue;
    }
    if (current.depth >= 4) continue;
    for (const entry of safeReadDirectories(current.directory)) {
      if (['tools', 'docs', 'examples', 'licenses', 'distfiles'].includes(entry.name.toLowerCase())) continue;
      queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
    }
  }
  return results;
}

export class QpmQtInstallationService {
  constructor(private readonly output: vscode.OutputChannel) {}

  scan(): QpmQtInstallation[] {
    const byRoot = new Map<string, QpmQtInstallation>();
    for (const base of candidateBases()) {
      for (const installation of scanBase(base)) byRoot.set(installation.root.toLowerCase(), installation);
    }
    const result = [...byRoot.values()].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }) || a.label.localeCompare(b.label));
    this.output.appendLine(`[Qt] ${result.length} installation(s) detected.`);
    return result;
  }

  getActive(overrideRoot?: string): QpmQtInstallation | undefined {
    const root = (overrideRoot ?? vscode.workspace.getConfiguration(SECTION).get<string>('activeQtInstallation', '')).trim();
    return root ? describeQtRoot(root) : undefined;
  }

  async select(): Promise<QpmQtInstallation | undefined> {
    const installations = this.scan();
    const items: Array<vscode.QuickPickItem & { installation?: QpmQtInstallation; manual?: boolean }> = installations.map((installation) => ({
      label: installation.label,
      description: installation.root,
      detail: qtInstallationDetail(installation),
      installation
    }));
    items.push({ label: '$(folder-opened) Add a Qt installation manually…', manual: true });
    const selected = await vscode.window.showQuickPick(items, { title: 'Select Qt installation', placeHolder: 'Qt version, ABI and matching compiler used by the active project' });
    if (!selected) return undefined;
    let installation = selected.installation;
    if (selected.manual) {
      const folders = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title: 'Select the Qt kit root (for example C:\\Qt\\6.11.0\\mingw_64)' });
      if (!folders?.length) return undefined;
      installation = describeQtRoot(folders[0].fsPath);
      if (!installation) throw new Error('The selected directory is not a valid Qt kit root. Expected bin, include, lib and Qt tools.');
      const config = vscode.workspace.getConfiguration(SECTION);
      const searchPaths = config.get<string[]>('qtSearchPaths', []);
      await config.update('qtSearchPaths', [...new Set([...searchPaths, folders[0].fsPath])], vscode.ConfigurationTarget.Global);
    }
    await this.applySelection(installation!);
    if (installation!.toolchain.compatibility === 'incompatible') {
      const action = await vscode.window.showWarningMessage(
        installation!.toolchain.diagnostic ?? 'The detected compiler is incompatible with the Qt kit.',
        'Select matching compiler'
      );
      if (action === 'Select matching compiler') return this.selectCompilerForActiveKit(installation!.root);
    } else {
      vscode.window.showInformationMessage(`Qt Project Manager: ${installation!.label} selected.`);
    }
    return installation;
  }

  async repairActiveToolchain(overrideRoot?: string): Promise<QpmQtInstallation | undefined> {
    const installation = this.getActive(overrideRoot);
    if (!installation) {
      vscode.window.showErrorMessage('Select a Qt installation before repairing its compiler toolchain.');
      return undefined;
    }
    if (installation.toolchain.cppCompilerPath && installation.toolchain.compatibility !== 'incompatible') {
      await this.applySelection(installation);
      vscode.window.showInformationMessage(`Qt toolchain resolved: ${installation.toolchain.cppCompilerPath}`);
      return installation;
    }
    return this.selectCompilerForActiveKit(installation.root);
  }

  async selectCompilerForActiveKit(overrideRoot?: string): Promise<QpmQtInstallation | undefined> {
    const current = this.getActive(overrideRoot);
    if (!current) {
      vscode.window.showErrorMessage('Select a Qt installation before choosing its compiler.');
      return undefined;
    }
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      title: `Select the ${current.compilerFamily} ${current.architecture} C++ compiler for ${current.label}`,
      filters: process.platform === 'win32' ? { Executables: ['exe'], 'All files': ['*'] } : { 'All files': ['*'] }
    });
    if (!files?.length) return undefined;
    const selectedCompiler = files[0].fsPath;
    const candidate = createToolchainFromCompiler(selectedCompiler, current.compilerFamily, current.architecture, 'qt-override');
    if (candidate.compatibility === 'incompatible') {
      vscode.window.showErrorMessage(candidate.diagnostic ?? 'The selected compiler is incompatible with the Qt kit.');
      return undefined;
    }
    await vscode.workspace.getConfiguration(SECTION).update('qtCompilerPath', selectedCompiler, vscode.ConfigurationTarget.Workspace);
    const refreshed = describeQtRoot(current.root);
    if (!refreshed) return undefined;
    await this.applySelection(refreshed);
    vscode.window.showInformationMessage(`Qt compiler selected: ${refreshed.toolchain.cppCompilerPath}`);
    return refreshed;
  }

  async selectDesignerExecutable(overrideRoot?: string): Promise<QpmQtInstallation | undefined> {
    const current = this.getActive(overrideRoot);
    if (!current) {
      vscode.window.showErrorMessage('Select a Qt installation before choosing Qt Widgets Designer.');
      return undefined;
    }
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(current.root),
      title: 'Select Qt Widgets Designer (designer.exe) or Qt Creator',
      filters: process.platform === 'win32' ? { Executables: ['exe'], 'All files': ['*'] } : { 'All files': ['*'] }
    });
    if (!files?.length) return undefined;
    const selectedPath = files[0].fsPath;
    const kind = designerLauncherKind(selectedPath);
    if (!kind) {
      vscode.window.showErrorMessage('Select designer.exe (Qt Widgets Designer) or qtcreator.exe.');
      return undefined;
    }
    await vscode.workspace.getConfiguration(SECTION).update('qtDesignerPath', selectedPath, vscode.ConfigurationTarget.Workspace);
    const refreshed = describeQtRoot(current.root);
    if (!refreshed?.designerPath) {
      vscode.window.showErrorMessage('The selected Qt Designer executable could not be saved or resolved.');
      return undefined;
    }
    this.output.appendLine(`[Qt Designer] Selected ${refreshed.designerLauncherKind}: ${refreshed.designerPath}`);
    vscode.window.showInformationMessage(`Qt Widgets Designer launcher selected: ${refreshed.designerPath}`);
    return refreshed;
  }

  async applySelection(installation: QpmQtInstallation): Promise<void> {
    const config = vscode.workspace.getConfiguration(SECTION);
    const target = vscode.ConfigurationTarget.Workspace;
    await config.update('activeQtInstallation', installation.root, target);
    if (installation.toolchain.cppCompilerPath && installation.toolchain.compatibility !== 'incompatible') {
      await config.update('cppCompilerPath', installation.toolchain.cppCompilerPath, target);
      await config.update('intelliSenseCompilerPath', installation.toolchain.cppCompilerPath, target);
    }
    if (installation.toolchain.cCompilerPath && installation.toolchain.compatibility !== 'incompatible') await config.update('cCompilerPath', installation.toolchain.cCompilerPath, target);
    if (installation.toolchain.archiverPath && installation.toolchain.compatibility !== 'incompatible') await config.update('archiverPath', installation.toolchain.archiverPath, target);
    if (installation.toolchain.debuggerPath && installation.toolchain.compatibility !== 'incompatible') await config.update('debuggerPath', installation.toolchain.debuggerPath, target);
    this.output.appendLine(`[Qt] Selected ${installation.label}.`);
    this.output.appendLine(`[Qt] Compiler: ${installation.toolchain.cppCompilerPath ?? 'not resolved'} (${installation.toolchain.source}, ${installation.toolchain.compatibility}).`);
    if (installation.toolchain.diagnostic) this.output.appendLine(`[Qt] ${installation.toolchain.diagnostic}`);
    this.output.appendLine(`[Qt] Widgets Designer: ${installation.designerPath ?? 'not resolved'}${installation.designerSource ? ` (${installation.designerSource})` : ''}.`);
  }

  async showInformation(): Promise<void> {
    const installation = this.getActive();
    if (!installation) {
      vscode.window.showWarningMessage('Qt Project Manager: no Qt installation is selected.');
      return;
    }
    const document = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(installation, null, 2) });
    await vscode.window.showTextDocument(document, { preview: true });
  }
}

function qtInstallationDetail(installation: QpmQtInstallation): string {
  const compiler = installation.toolchain.cppCompilerPath
    ? `${installation.toolchain.compatibility === 'incompatible' ? '✗' : '✓'} ${installation.toolchain.detectedArchitecture ?? 'unknown'} ${path.basename(installation.toolchain.cppCompilerPath)}`
    : '✗ not resolved';
  return `moc ${installation.mocPath ? '✓' : '✗'} · uic ${installation.uicPath ? '✓' : '✗'} · rcc ${installation.rccPath ? '✓' : '✗'} · Designer ${installation.designerPath ? '✓' : '✗'} · Linguist ${installation.linguistPath && installation.lupdatePath && installation.lreleasePath ? '✓' : '✗'} · QML tools ${installation.qmlLintPath && installation.qmlFormatPath ? '✓' : '✗'} · CMake ${installation.cmakePath ? '✓' : '✗'} · Ninja ${installation.ninjaPath ? '✓' : '✗'} · compiler ${compiler}`;
}
