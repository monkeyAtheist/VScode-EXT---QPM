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
exports.ensureBundledQpmLibraryPack = exports.QPM_BUNDLED_LIBRARY_PACKS = void 0;
exports.ensureBundledCppLibraryPack = ensureBundledCppLibraryPack;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
/**
 * Canonical JC Lib 0.8.27 packs preinstalled by QPM.
 *
 * Each file keeps the environment -> library -> category -> group hierarchy used
 * by the standalone JC Lib extension. They are deliberately separate so a Qt
 * workspace can display only the domain roots that are useful to QPM without a
 * synthetic "Qt Project Manager" environment.
 */
exports.QPM_BUNDLED_LIBRARY_PACKS = [
    { fileName: 'qpm_base_qt_pack.json', expectedId: 'qpm.base.qt', label: 'Qt Complete' },
    { fileName: 'qpm_base_c_pack.json', expectedId: 'qpm.base.c', label: 'C' },
    { fileName: 'qpm_base_cpp_pack.json', expectedId: 'qpm.base.cpp', label: 'C++' },
    { fileName: 'qpm_base_preprocessor_pack.json', expectedId: 'qpm.base.preprocessor', label: 'C/C++ Preprocessor' },
    { fileName: 'qpm_base_windows_pack.json', expectedId: 'qpm.base.windows', label: 'Windows API / Devices' },
    { fileName: 'qpm_base_python_pack.json', expectedId: 'qpm.base.python', label: 'Python' }
];
function readPackIdentity(filePath) {
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function sanitizeVersion(version) {
    return String(version || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_');
}
function createBackupPath(targetDirectory, fileName, previousVersion) {
    const backupDirectory = path.join(targetDirectory, 'backups');
    fs.mkdirSync(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = sanitizeVersion(previousVersion);
    return path.join(backupDirectory, `${fileName}.backup-${suffix}-${timestamp}.json`);
}
function backupAndRemove(filePath, targetDirectory, output, reason) {
    if (!fs.existsSync(filePath))
        return;
    const identity = readPackIdentity(filePath);
    const stem = path.basename(filePath, path.extname(filePath));
    const backup = createBackupPath(targetDirectory, stem, identity?.version);
    fs.copyFileSync(filePath, backup);
    fs.unlinkSync(filePath);
    output.appendLine(`[Qt Libraries] ${reason}. Backup: ${backup}`);
}
function migrateLegacySingleCorePack(targetDirectory, output) {
    const legacyCandidates = ['qpm_core_pack.json', 'qpm_pack.json'];
    for (const fileName of legacyCandidates) {
        const filePath = path.join(targetDirectory, fileName);
        if (!fs.existsSync(filePath))
            continue;
        const identity = readPackIdentity(filePath);
        const id = String(identity?.id || '').toLowerCase();
        const name = String(identity?.name || '').toLowerCase();
        const isLegacy = fileName === 'qpm_core_pack.json'
            || id === 'qpm-c-cpp-core-pack'
            || id === 'qpm-structured-pack'
            || name.includes('qt project manager core')
            || name.includes('labwindows/qpm');
        if (isLegacy) {
            backupAndRemove(filePath, targetDirectory, output, 'Migrated the legacy combined QPM library pack to the six JC Lib 0.8.27 packs');
        }
    }
}
function installOrUpgradePack(context, targetDirectory, spec, output) {
    const source = vscode.Uri.joinPath(context.extensionUri, 'data', spec.fileName).fsPath;
    const target = path.join(targetDirectory, spec.fileName);
    if (!fs.existsSync(source)) {
        output.appendLine(`[Qt Libraries] Bundled ${spec.label} pack not found: ${source}`);
        return 'missing';
    }
    const bundled = readPackIdentity(source);
    if (!bundled || bundled.id !== spec.expectedId) {
        output.appendLine(`[Qt Libraries] Rejected invalid bundled ${spec.label} pack: expected id ${spec.expectedId}, found ${bundled?.id || 'none'}.`);
        return 'missing';
    }
    if (!fs.existsSync(target)) {
        fs.copyFileSync(source, target);
        output.appendLine(`[Qt Libraries] Installed integrated ${spec.label} pack (${bundled.version || 'unknown'}).`);
        return 'installed';
    }
    const installed = readPackIdentity(target);
    const sameId = installed?.id === spec.expectedId;
    const sameVersion = String(installed?.version || '') === String(bundled.version || '');
    if (sameId && sameVersion) {
        return 'current';
    }
    const backup = createBackupPath(targetDirectory, path.basename(spec.fileName, '.json'), installed?.version);
    fs.copyFileSync(target, backup);
    fs.copyFileSync(source, target);
    output.appendLine(`[Qt Libraries] Upgraded integrated ${spec.label} pack ${installed?.version || 'unknown'} -> ${bundled.version || 'unknown'}.`);
    output.appendLine(`[Qt Libraries] Previous pack backed up to: ${backup}`);
    return 'upgraded';
}
/**
 * Seed or upgrade the canonical JC Lib 0.8.27 pack set used by QPM.
 *
 * The old combined qpm_core_pack.json is backed up and removed to prevent
 * duplicated C/C++/preprocessor nodes. User-created global and workspace packs
 * are not touched.
 */
function ensureBundledCppLibraryPack(context, output) {
    const targetDirectory = path.join(context.globalStorageUri.fsPath, 'packs');
    fs.mkdirSync(targetDirectory, { recursive: true });
    migrateLegacySingleCorePack(targetDirectory, output);
    const counts = { installed: 0, upgraded: 0, current: 0, missing: 0 };
    for (const spec of exports.QPM_BUNDLED_LIBRARY_PACKS) {
        counts[installOrUpgradePack(context, targetDirectory, spec, output)] += 1;
    }
    output.appendLine(`[Qt Libraries] JC Lib 0.8.27 integrated packs: ${counts.installed} installed, ${counts.upgraded} upgraded, ${counts.current} current, ${counts.missing} missing.`);
}
// Backward-compatible exported name for older imports inside the extension.
exports.ensureBundledQpmLibraryPack = ensureBundledCppLibraryPack;
