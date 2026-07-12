"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.packagingMetadataPaths = packagingMetadataPaths;
exports.resolveQtPackageIdentity = resolveQtPackageIdentity;
exports.writeQtPackagingMetadata = writeQtPackagingMetadata;
exports.renderWindowsApplicationManifest = renderWindowsApplicationManifest;
exports.renderWindowsResourceScript = renderWindowsResourceScript;
exports.renderLinuxDesktopEntry = renderLinuxDesktopEntry;
exports.normalizeFourPartVersion = normalizeFourPartVersion;
exports.sanitizePackageName = sanitizePackageName;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
function packagingMetadataPaths(manifestPath) {
    const root = path.join(path.dirname(manifestPath), '.qpm', 'packaging', 'generated');
    return {
        root,
        windowsManifest: path.join(root, 'windows', 'application.manifest'),
        windowsResource: path.join(root, 'windows', 'qpm_product.rc'),
        linuxDesktopEntry: path.join(root, 'linux', 'application.desktop'),
        packageInfo: path.join(root, 'package-info.json')
    };
}
function resolveQtPackageIdentity(manifest, mode) {
    const platformProfile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(manifest);
    const kit = (0, qtProjectManifest_1.getActiveQtKitProfile)(manifest);
    const architecture = (0, qtProjectManifest_1.inferQtKitArchitecture)(kit) === 'x86' ? 'x86' : (0, qtProjectManifest_1.inferQtKitArchitecture)(kit) === 'x64' ? 'x64' : 'unknown';
    const platform = platformProfile?.type || kit?.deviceType || 'desktop';
    const configuration = mode === 'release' || mode === 'release64' ? 'release' : 'debug';
    const productName = manifest.packaging.productName || manifest.name;
    const version = manifest.packaging.productVersion || '1.0.0';
    const tokens = { productName, version, platform, arch: architecture, configuration, target: manifest.targetName };
    let packageName = manifest.packaging.packageNamePattern || '${productName}-${version}-${platform}-${arch}';
    packageName = packageName.replace(/\$\{(productName|version|platform|arch|configuration|target)\}/g, (_, key) => tokens[key] || '');
    packageName = sanitizePackageName(packageName);
    return { productName, version, platform, architecture, configuration, packageName };
}
function writeQtPackagingMetadata(manifestPath, manifest, mode) {
    const paths = packagingMetadataPaths(manifestPath);
    fs.mkdirSync(path.dirname(paths.windowsManifest), { recursive: true });
    fs.mkdirSync(path.dirname(paths.linuxDesktopEntry), { recursive: true });
    writeIfChanged(paths.windowsManifest, renderWindowsApplicationManifest(manifest));
    writeIfChanged(paths.windowsResource, renderWindowsResourceScript(manifestPath, manifest, paths.windowsManifest));
    writeIfChanged(paths.linuxDesktopEntry, renderLinuxDesktopEntry(manifestPath, manifest));
    const identity = resolveQtPackageIdentity(manifest, mode);
    writeIfChanged(paths.packageInfo, `${JSON.stringify({ generatedBy: 'Qt Project Manager', schemaVersion: manifest.schemaVersion, project: manifest.name, target: manifest.targetName, ...identity, metadata: manifest.packaging }, null, 2)}\n`);
    return paths;
}
function renderWindowsApplicationManifest(manifest) {
    const level = manifest.packaging.windows.executionLevel;
    const dpi = manifest.packaging.windows.dpiAwareness;
    const dpiValue = dpi === 'per-monitor-v2' ? 'PerMonitorV2,PerMonitor' : dpi === 'per-monitor' ? 'PerMonitor' : dpi === 'system' ? 'system' : 'unaware';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">\n  <assemblyIdentity version="${xmlEscape(normalizeFourPartVersion(manifest.packaging.productVersion))}" processorArchitecture="*" name="${xmlEscape(manifest.packaging.identifier)}" type="win32"/>\n  <description>${xmlEscape(manifest.packaging.description)}</description>\n  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">\n    <security><requestedPrivileges><requestedExecutionLevel level="${level}" uiAccess="false"/></requestedPrivileges></security>\n  </trustInfo>\n  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">${dpiValue}</dpiAwareness><longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware></windowsSettings></application>\n  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application></compatibility>\n</assembly>\n`;
}
function renderWindowsResourceScript(manifestPath, manifest, generatedManifestPath) {
    const projectRoot = path.dirname(manifestPath);
    const icon = manifest.packaging.icon ? path.resolve(projectRoot, manifest.packaging.icon) : '';
    const customManifest = manifest.packaging.windows.manifestFile ? path.resolve(projectRoot, manifest.packaging.windows.manifestFile) : generatedManifestPath;
    const numericVersion = normalizeFourPartVersion(manifest.packaging.productVersion).replace(/\./g, ',');
    const stringVersion = manifest.packaging.productVersion;
    const p = manifest.packaging;
    const w = p.windows;
    const lines = [
        '#include <windows.h>',
        '',
        `${numericVersion ? `#define QPM_FILE_VERSION ${numericVersion}` : '#define QPM_FILE_VERSION 1,0,0,0'}`,
        `#define QPM_FILE_VERSION_STR "${rcEscape(stringVersion)}\\0"`,
        '',
        icon ? `IDI_QPM_APP ICON "${rcPath(icon)}"` : '',
        customManifest ? `1 RT_MANIFEST "${rcPath(customManifest)}"` : '',
        '',
        'VS_VERSION_INFO VERSIONINFO',
        ' FILEVERSION QPM_FILE_VERSION',
        ' PRODUCTVERSION QPM_FILE_VERSION',
        ' FILEFLAGSMASK 0x3fL',
        ' FILEFLAGS 0x0L',
        ' FILEOS 0x40004L',
        ' FILETYPE 0x1L',
        ' FILESUBTYPE 0x0L',
        'BEGIN',
        '  BLOCK "StringFileInfo"',
        '  BEGIN',
        '    BLOCK "040904b0"',
        '    BEGIN',
        `      VALUE "CompanyName", "${rcEscape(p.companyName)}\\0"`,
        `      VALUE "FileDescription", "${rcEscape(w.fileDescription || p.description)}\\0"`,
        '      VALUE "FileVersion", QPM_FILE_VERSION_STR',
        `      VALUE "InternalName", "${rcEscape(w.internalName || manifest.targetName)}\\0"`,
        `      VALUE "LegalCopyright", "${rcEscape(p.copyright)}\\0"`,
        `      VALUE "OriginalFilename", "${rcEscape(w.originalFilename || `${manifest.targetName}.exe`)}\\0"`,
        `      VALUE "ProductName", "${rcEscape(p.productName)}\\0"`,
        '      VALUE "ProductVersion", QPM_FILE_VERSION_STR',
        '    END',
        '  END',
        '  BLOCK "VarFileInfo"',
        '  BEGIN',
        '    VALUE "Translation", 0x0409, 1200',
        '  END',
        'END',
        ''
    ].filter((line) => line !== '');
    return `${lines.join('\n')}\n`;
}
function renderLinuxDesktopEntry(manifestPath, manifest) {
    const projectRoot = path.dirname(manifestPath);
    const icon = manifest.packaging.icon ? path.resolve(projectRoot, manifest.packaging.icon) : manifest.packaging.linux.appId;
    return `[Desktop Entry]\nType=Application\nVersion=1.0\nName=${desktopEscape(manifest.packaging.productName)}\nComment=${desktopEscape(manifest.packaging.linux.comment || manifest.packaging.description)}\nExec=${desktopEscape(manifest.targetName)}\nIcon=${desktopEscape(icon)}\nTerminal=${manifest.kind === 'console-application' ? 'true' : 'false'}\nCategories=${manifest.packaging.linux.categories.map((entry) => entry.replace(/;/g, '')).join(';')};\nStartupWMClass=${desktopEscape(manifest.targetName)}\nX-QPM-AppId=${desktopEscape(manifest.packaging.linux.appId)}\n`;
}
function normalizeFourPartVersion(value) {
    const match = value.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/);
    return [match?.[1] ?? '1', match?.[2] ?? '0', match?.[3] ?? '0', match?.[4] ?? '0'].map((entry) => String(Math.max(0, Math.min(65535, Number(entry) || 0)))).join('.');
}
function sanitizePackageName(value) {
    const normalized = value.trim().replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^[.-]+|[. -]+$/g, '');
    return normalized || 'qt-package';
}
function writeIfChanged(filePath, content) {
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content)
        return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}
function rcPath(value) { return value.replace(/\\/g, '/').replace(/"/g, '\\"'); }
function rcEscape(value) { return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' '); }
function xmlEscape(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function desktopEscape(value) { return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/;/g, '\\;'); }
