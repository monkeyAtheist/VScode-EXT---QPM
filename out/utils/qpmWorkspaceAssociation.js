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
exports.QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH = void 0;
exports.writeQpmWorkspaceAssociation = writeQpmWorkspaceAssociation;
exports.inspectQpmWorkspaceAssociation = inspectQpmWorkspaceAssociation;
exports.resolveQpmWorkspaceAssociation = resolveQpmWorkspaceAssociation;
exports.removeQpmWorkspaceAssociation = removeQpmWorkspaceAssociation;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH = path.join('.vscode', 'qpm-workspace.json');
function toPortableRelativePath(value) {
    return value.replace(/\\/g, '/');
}
function writeQpmWorkspaceAssociation(projectRoot, workspacePath, projectManifestPath) {
    const normalizedRoot = path.resolve(projectRoot);
    const normalizedWorkspacePath = path.resolve(workspacePath);
    const relativeWorkspacePath = path.relative(normalizedRoot, normalizedWorkspacePath) || path.basename(normalizedWorkspacePath);
    const relativeManifestPath = projectManifestPath
        ? path.relative(normalizedRoot, path.resolve(projectManifestPath)) || path.basename(projectManifestPath)
        : undefined;
    const document = {
        schemaVersion: 1,
        workspacePath: toPortableRelativePath(relativeWorkspacePath),
        ...(relativeManifestPath ? { projectManifest: toPortableRelativePath(relativeManifestPath) } : {})
    };
    const markerPath = path.join(normalizedRoot, exports.QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH);
    const rendered = `${JSON.stringify(document, null, 2)}\n`;
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    const previous = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8') : undefined;
    if (previous !== rendered) {
        fs.writeFileSync(markerPath, rendered, 'utf8');
    }
    return markerPath;
}
function inspectQpmWorkspaceAssociation(projectRoot, removeStale = false) {
    const normalizedRoot = path.resolve(projectRoot);
    const markerPath = path.join(normalizedRoot, exports.QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH);
    if (!fs.existsSync(markerPath)) {
        return { markerPath, valid: false, stale: false, reason: 'association marker not found' };
    }
    const stale = (reason, workspacePath, projectManifestPath) => {
        if (removeStale) {
            try {
                fs.unlinkSync(markerPath);
                removeDirectoryIfEmpty(path.dirname(markerPath));
            }
            catch {
                // Keep startup resilient even when the stale file is read-only.
            }
        }
        return { markerPath, workspacePath, projectManifestPath, valid: false, stale: true, reason };
    };
    try {
        const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        if (parsed.schemaVersion !== 1 || typeof parsed.workspacePath !== 'string' || !parsed.workspacePath.trim()) {
            return stale('invalid association document');
        }
        const workspacePath = path.isAbsolute(parsed.workspacePath)
            ? path.normalize(parsed.workspacePath)
            : path.resolve(normalizedRoot, parsed.workspacePath);
        const lower = workspacePath.toLowerCase();
        if (!lower.endsWith('.cws') && !lower.endsWith('.prj') && !lower.endsWith('.qtproject.json')) {
            return stale('unsupported associated workspace type', workspacePath);
        }
        if (!fs.existsSync(workspacePath)) {
            return stale('associated workspace no longer exists', workspacePath);
        }
        let projectManifestPath;
        if (typeof parsed.projectManifest === 'string' && parsed.projectManifest.trim()) {
            projectManifestPath = path.isAbsolute(parsed.projectManifest)
                ? path.normalize(parsed.projectManifest)
                : path.resolve(normalizedRoot, parsed.projectManifest);
            if (!fs.existsSync(projectManifestPath)) {
                return stale('associated project manifest no longer exists', workspacePath, projectManifestPath);
            }
        }
        return { markerPath, workspacePath, projectManifestPath, valid: true, stale: false };
    }
    catch {
        return stale('association document cannot be parsed');
    }
}
function resolveQpmWorkspaceAssociation(projectRoot, removeStale = true) {
    const inspection = inspectQpmWorkspaceAssociation(projectRoot, removeStale);
    return inspection.valid ? inspection.workspacePath : undefined;
}
function removeQpmWorkspaceAssociation(projectRoot, expectedWorkspacePath) {
    const normalizedRoot = path.resolve(projectRoot);
    const markerPath = path.join(normalizedRoot, exports.QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH);
    if (!fs.existsSync(markerPath)) {
        return false;
    }
    if (expectedWorkspacePath) {
        const resolved = resolveQpmWorkspaceAssociation(normalizedRoot);
        if (!resolved || path.normalize(resolved).toLowerCase() !== path.resolve(expectedWorkspacePath).toLowerCase()) {
            return false;
        }
    }
    try {
        fs.unlinkSync(markerPath);
        removeDirectoryIfEmpty(path.dirname(markerPath));
        return true;
    }
    catch {
        return false;
    }
}
function removeDirectoryIfEmpty(directory) {
    try {
        if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
            fs.rmdirSync(directory);
        }
    }
    catch {
        // Best-effort cleanup only.
    }
}
