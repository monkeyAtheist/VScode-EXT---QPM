import * as fs from 'fs';
import * as path from 'path';
import { QtLinkageMode } from '../model/qtProjectManifest';
import { QpmQtInstallation } from './qpmQtInstallationService';

export type QtKitLinkage = 'dynamic' | 'static' | 'unknown';

export function detectQtKitLinkage(installation: QpmQtInstallation): QtKitLinkage {
  const major = installation.majorVersion || Number(installation.version.split('.')[0]) || 6;
  const family = installation.toolchain.family || installation.compilerFamily;
  const windowsKit = family === 'mingw' || family === 'msvc';

  const qconfigCandidates = [
    path.join(installation.root, 'mkspecs', 'qconfig.pri'),
    path.join(installation.libDir, 'mkspecs', 'qconfig.pri')
  ];
  for (const qconfigPath of qconfigCandidates) {
    try {
      const text = fs.readFileSync(qconfigPath, 'utf8');
      const configTokens = [...text.matchAll(/^QT_CONFIG\s*(?:\+?=)\s*(.*)$/gm)]
        .flatMap((match) => match[1].split(/\s+/))
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
      if (configTokens.includes('static')) return 'static';
      if (configTokens.includes('shared')) return 'dynamic';
    } catch {
      // qconfig.pri is optional for manually assembled kits.
    }
  }

  const dynamicCandidates = windowsKit
    ? [path.join(installation.binDir, `Qt${major}Core.dll`), path.join(installation.binDir, `Qt${major}Cored.dll`)]
    : process.platform === 'darwin'
      ? [path.join(installation.libDir, 'QtCore.framework'), path.join(installation.libDir, `libQt${major}Core.dylib`)]
      : [path.join(installation.libDir, `libQt${major}Core.so`), path.join(installation.libDir, `libQt${major}Core.so.${major}`)];
  if (dynamicCandidates.some((candidate) => fs.existsSync(candidate))) return 'dynamic';

  if (!windowsKit) {
    const staticCandidates = [
      path.join(installation.libDir, `libQt${major}Core.a`),
      path.join(installation.libDir, `Qt${major}Core.a`)
    ];
    if (staticCandidates.some((candidate) => fs.existsSync(candidate))) return 'static';
  }
  return 'unknown';
}

export function compilerStaticRuntimeLinkerFlags(installation: QpmQtInstallation, linkage: QtLinkageMode): string[] {
  if (linkage !== 'static-runtime' && linkage !== 'static-qt') return [];
  const family = installation.toolchain.family || installation.compilerFamily;
  if (family === 'mingw' || family === 'gcc') return ['-static-libgcc', '-static-libstdc++'];
  return [];
}

export function validateQtLinkageSelection(installation: QpmQtInstallation, linkage: QtLinkageMode, backend: 'direct' | 'qmake' | 'cmake'): string | undefined {
  const kitLinkage = detectQtKitLinkage(installation);
  const family = installation.toolchain.family || installation.compilerFamily;

  if ((linkage === 'dynamic' || linkage === 'static-runtime') && kitLinkage === 'static') {
    return `The selected Qt kit (${installation.label}) is static. Select “Static Qt kit” linkage, or choose a normal dynamic Qt kit.`;
  }
  if (linkage === 'static-runtime' && family !== 'mingw' && family !== 'gcc') {
    return `Static compiler-runtime linkage is currently automated for MinGW/GCC kits. The selected compiler family is ${family}.`;
  }
  if (linkage === 'static-qt') {
    if (kitLinkage !== 'static') {
      return `Static Qt linkage requires a Qt kit built with -static. The selected kit (${installation.label}) is ${kitLinkage === 'dynamic' ? 'dynamic' : 'not recognized as static'}.`;
    }
    if (backend === 'direct') {
      return 'Static Qt kits are supported through the qmake or CMake backend. The direct backend does not yet resolve static Qt plugins and all transitive platform libraries.';
    }
  }
  return undefined;
}
