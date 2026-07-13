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
exports.cleanQtDirectModeDirectory = cleanQtDirectModeDirectory;
exports.removePathWithRetries = removePathWithRetries;
exports.createPendingDirectoryName = createPendingDirectoryName;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Clean a direct-build output atomically when possible.
 *
 * Important Windows rule: do not recreate `generated`/`obj` from the clean
 * command. File watchers, IntelliSense and antivirus scanners may still be
 * transitioning from the renamed directory and Windows can reject an
 * immediate mkdir with EPERM. The next build owns directory creation through
 * QpmBuildService.ensureDirectory(), which already retries and diagnoses the
 * operation.
 *
 * If the atomic rename is unavailable, QPM cleans in place while preserving
 * the required directory roots. This avoids a delete/recreate race entirely.
 */
async function cleanQtDirectModeDirectory(options) {
    const modeDirectory = path.normalize(options.modeDirectory);
    const requiredDirectories = unique(options.requiredDirectories.map((entry) => path.normalize(entry)));
    const retryCount = Math.max(1, options.retryCount ?? 8);
    const retryDelayMs = Math.max(10, options.retryDelayMs ?? 120);
    const warnings = [];
    for (const pending of findPendingDirectories(modeDirectory)) {
        if (!await removePathWithRetries(pending, Math.max(2, Math.ceil(retryCount / 2)), retryDelayMs)) {
            warnings.push(`A previous pending clean directory is still locked: ${pending}`);
        }
    }
    if (!fs.existsSync(modeDirectory)) {
        return { success: true, strategy: 'absent', warnings };
    }
    const pendingDirectory = createPendingDirectoryName(modeDirectory);
    let lastRenameError;
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            fs.renameSync(modeDirectory, pendingDirectory);
            const removed = await removePathWithRetries(pendingDirectory, Math.max(3, Math.ceil(retryCount / 2)), retryDelayMs);
            if (!removed) {
                warnings.push(`The previous build was moved to ${pendingDirectory}, but Windows still has a handle open. QPM will retry removal during the next clean.`);
            }
            return { success: true, strategy: 'rename', pendingDirectory: removed ? undefined : pendingDirectory, warnings };
        }
        catch (error) {
            lastRenameError = error;
            if (!isRetryableFileSystemError(error) || attempt === retryCount)
                break;
            await delay(retryDelayMs * attempt);
        }
    }
    warnings.push(`Atomic clean rename was unavailable: ${formatError(lastRenameError)}. Falling back to in-place cleanup.`);
    const failures = [];
    try {
        const preservedRoots = requiredDirectories.filter((entry) => isSameOrChildPath(entry, modeDirectory));
        for (const entry of fs.readdirSync(modeDirectory)) {
            const candidate = path.join(modeDirectory, entry);
            const preserved = preservedRoots.find((root) => pathsEqual(root, candidate));
            if (preserved && isDirectory(candidate)) {
                if (!await clearDirectoryContents(candidate, retryCount, retryDelayMs))
                    failures.push(candidate);
                continue;
            }
            if (!await removePathWithRetries(candidate, retryCount, retryDelayMs))
                failures.push(candidate);
        }
    }
    catch (error) {
        failures.push(modeDirectory);
        warnings.push(`Unable to enumerate the build output directory: ${formatError(error)}.`);
    }
    if (failures.length > 0) {
        warnings.push(`Unable to remove ${failures.length} locked build item(s): ${failures.join(', ')}`);
    }
    return { success: failures.length === 0, strategy: 'in-place', warnings };
}
async function removePathWithRetries(targetPath, retryCount = 8, retryDelayMs = 120) {
    for (let attempt = 1; attempt <= Math.max(1, retryCount); attempt++) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 0 });
            if (!fs.existsSync(targetPath))
                return true;
        }
        catch (error) {
            if (!isRetryableFileSystemError(error) || attempt === retryCount)
                return !fs.existsSync(targetPath);
        }
        await delay(Math.max(10, retryDelayMs) * attempt);
    }
    return !fs.existsSync(targetPath);
}
function createPendingDirectoryName(modeDirectory, now = Date.now(), processId = process.pid) {
    const parent = path.dirname(modeDirectory);
    const base = path.basename(modeDirectory);
    let candidate = path.join(parent, `.${base}.qpm-clean-pending-${processId}-${now}`);
    let suffix = 1;
    while (fs.existsSync(candidate))
        candidate = path.join(parent, `.${base}.qpm-clean-pending-${processId}-${now}-${suffix++}`);
    return candidate;
}
async function clearDirectoryContents(directory, retryCount, retryDelayMs) {
    let entries;
    try {
        entries = fs.readdirSync(directory);
    }
    catch (error) {
        return !fs.existsSync(directory);
    }
    let success = true;
    for (const entry of entries) {
        if (!await removePathWithRetries(path.join(directory, entry), retryCount, retryDelayMs))
            success = false;
    }
    return success;
}
function findPendingDirectories(modeDirectory) {
    const parent = path.dirname(modeDirectory);
    const prefix = `.${path.basename(modeDirectory)}.qpm-clean-pending-`;
    try {
        return fs.readdirSync(parent)
            .filter((entry) => entry.startsWith(prefix))
            .map((entry) => path.join(parent, entry));
    }
    catch {
        return [];
    }
}
function isRetryableFileSystemError(error) {
    const code = error?.code;
    return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'ENOENT';
}
function formatError(error) {
    if (error instanceof Error)
        return error.message;
    return String(error ?? 'unknown error');
}
function unique(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const key = process.platform === 'win32' ? value.toLowerCase() : value;
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(value);
    }
    return result;
}
function pathsEqual(left, right) {
    const normalizedLeft = path.resolve(left);
    const normalizedRight = path.resolve(right);
    return process.platform === 'win32'
        ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
        : normalizedLeft === normalizedRight;
}
function isSameOrChildPath(candidate, parent) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function isDirectory(candidate) {
    try {
        return fs.statSync(candidate).isDirectory();
    }
    catch {
        return false;
    }
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
