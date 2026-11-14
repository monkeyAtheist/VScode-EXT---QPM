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
exports.toolLabel = toolLabel;
exports.resolveToolStatus = resolveToolStatus;
exports.resolveFileStatus = resolveFileStatus;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function toolLabel(value) {
    const trimmed = String(value ?? '').trim();
    return trimmed ? path.basename(trimmed) : 'not set';
}
/** Explicit paths must exist; bare names are looked up in the active QPM toolchain and on PATH. */
function resolveToolStatus(value, baseDir, activeInstallation) {
    const tool = String(value ?? '').trim();
    if (!tool || tool.includes('${'))
        return { status: 'ok', message: '' };
    const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
    const exists = (candidate) => extensions.some((extension) => { try {
        return fs.statSync(candidate + extension).isFile();
    }
    catch {
        return false;
    } });
    if (path.isAbsolute(tool) || /[\\/]/.test(tool)) {
        const resolved = path.isAbsolute(tool) ? tool : path.resolve(baseDir ?? process.cwd(), tool);
        return exists(resolved) ? { status: 'ok', message: '' } : { status: 'missing', message: `Not found: ${resolved}` };
    }
    const directories = [activeInstallation, activeInstallation ? path.join(activeInstallation, 'bin') : '', ...String(process.env.PATH ?? '').split(path.delimiter)].filter(Boolean);
    return directories.some((directory) => exists(path.join(directory, tool)))
        ? { status: 'ok', message: '' }
        : { status: 'unresolved', message: `${tool} is not in the active toolchain or on PATH` };
}
function resolveFileStatus(value, baseDir) {
    const file = String(value ?? '').trim();
    if (!file || file.includes('${'))
        return { status: 'ok', message: '' };
    const resolved = path.isAbsolute(file) ? file : path.resolve(baseDir ?? process.cwd(), file);
    return fs.existsSync(resolved) ? { status: 'ok', message: '' } : { status: 'missing', message: `File not found: ${resolved}` };
}
