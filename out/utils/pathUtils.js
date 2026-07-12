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
exports.quote = quote;
exports.unquote = unquote;
exports.toQpmPath = toQpmPath;
exports.fromQpmPath = fromQpmPath;
exports.splitQpmLongValue = splitQpmLongValue;
exports.normalizeRelativePath = normalizeRelativePath;
exports.fileNameWithoutExtension = fileNameWithoutExtension;
exports.toQpmRuntimeStoragePath = toQpmRuntimeStoragePath;
exports.normalizeRuntimePath = normalizeRuntimePath;
const path = __importStar(require("path"));
function quote(value) {
    return `"${value.replace(/"/g, '\\"')}"`;
}
function unquote(value) {
    if (value === undefined) {
        return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/\\"/g, '"');
    }
    return trimmed;
}
function toQpmPath(inputPath) {
    const normalized = inputPath.replace(/\\/g, '/');
    const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
    if (driveMatch) {
        return `/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
    }
    return normalized;
}
function fromQpmPath(inputPath) {
    const value = unquote(inputPath) ?? '';
    const driveMatch = value.match(/^\/([A-Za-z])\/(.*)$/);
    if (driveMatch) {
        return `${driveMatch[1].toUpperCase()}:\\${driveMatch[2].replace(/\//g, '\\')}`;
    }
    return value.replace(/\//g, path.sep);
}
function splitQpmLongValue(value, maxLength = 96) {
    if (value.length <= maxLength) {
        return [value];
    }
    const parts = [];
    let offset = 0;
    while (offset < value.length) {
        parts.push(value.slice(offset, offset + maxLength));
        offset += maxLength;
    }
    return parts;
}
function normalizeRelativePath(fromDirectory, targetPath) {
    const relative = path.relative(fromDirectory, targetPath).replace(/\\/g, '/');
    return relative === '' ? path.basename(targetPath) : relative;
}
function fileNameWithoutExtension(filePath) {
    return path.basename(filePath, path.extname(filePath));
}
function toQpmRuntimeStoragePath(inputPath) {
    const trimmed = inputPath.trim();
    if (!trimmed) {
        return '';
    }
    const cygdrive = trimmed.match(/^\/cygdrive\/([A-Za-z])\/(.*)$/);
    if (cygdrive) {
        return `/${cygdrive[1].toLowerCase()}/${cygdrive[2].replace(/\\/g, '/')}`;
    }
    const qpmDrive = trimmed.match(/^\/([A-Za-z])\/(.*)$/);
    if (qpmDrive) {
        return `/${qpmDrive[1].toLowerCase()}/${qpmDrive[2].replace(/\\/g, '/')}`;
    }
    if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
        return toQpmPath(trimmed);
    }
    return trimmed;
}
function normalizeRuntimePath(inputPath) {
    const trimmed = inputPath.trim();
    if (!trimmed) {
        return '';
    }
    const expanded = trimmed.replace(/%([^%]+)%/g, (_match, name) => process.env[name] ?? `%${name}%`);
    const cygdrive = expanded.match(/^\/cygdrive\/([A-Za-z])\/(.*)$/);
    if (cygdrive) {
        return path.win32.normalize(`${cygdrive[1].toUpperCase()}:\\${cygdrive[2].replace(/\//g, '\\')}`);
    }
    const qpmDrive = expanded.match(/^\/([A-Za-z])\/(.*)$/);
    if (qpmDrive) {
        return path.win32.normalize(`${qpmDrive[1].toUpperCase()}:\\${qpmDrive[2].replace(/\//g, '\\')}`);
    }
    if (/^[A-Za-z]:[\\/]/.test(expanded)) {
        return path.win32.normalize(expanded.replace(/\//g, '\\'));
    }
    return path.normalize(expanded);
}
