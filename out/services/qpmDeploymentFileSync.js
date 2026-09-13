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
exports.stageDeploymentTarget = stageDeploymentTarget;
exports.sha256File = sha256File;
exports.touchDeploymentTarget = touchDeploymentTarget;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Stage the just-built executable/library into the standalone deployment tree.
 *
 * The destination is deliberately replaced instead of overwritten in place.
 * On Windows this gives the deployed binary a fresh file identity, which helps
 * Explorer invalidate stale executable-icon metadata after the PE resources
 * (for example the application .ico) change between builds.
 */
function stageDeploymentTarget(sourcePath, targetPath) {
    const source = path.resolve(sourcePath);
    const target = path.resolve(targetPath);
    if (!fs.existsSync(source))
        throw new Error(`Deployment source does not exist: ${source}`);
    const sourceHash = sha256File(source);
    const sourceSize = fs.statSync(source).size;
    if (sameFilePath(source, target)) {
        touchDeploymentTarget(target);
        return { sourceHash, targetHash: sourceHash, size: sourceSize, replacedExistingTarget: false };
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const replacedExistingTarget = fs.existsSync(target);
    const temporaryTarget = path.join(path.dirname(target), `.${path.basename(target)}.qpm-stage-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try {
        fs.copyFileSync(source, temporaryTarget);
        const temporaryHash = sha256File(temporaryTarget);
        if (temporaryHash !== sourceHash || fs.statSync(temporaryTarget).size !== sourceSize) {
            throw new Error('The staged deployment binary does not match the build output.');
        }
        // Never overwrite the previous file in place. Removing it first is
        // intentional: Windows Explorer can otherwise keep the previous PE icon in
        // its path-based icon cache even though the file contents changed.
        if (fs.existsSync(target))
            fs.rmSync(target, { force: true });
        fs.renameSync(temporaryTarget, target);
        touchDeploymentTarget(target);
        const targetHash = sha256File(target);
        if (targetHash !== sourceHash || fs.statSync(target).size !== sourceSize) {
            throw new Error('The deployed target differs from the build output after staging.');
        }
        return { sourceHash, targetHash, size: sourceSize, replacedExistingTarget };
    }
    finally {
        try {
            if (fs.existsSync(temporaryTarget))
                fs.rmSync(temporaryTarget, { force: true });
        }
        catch { /* best effort */ }
    }
}
function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function touchDeploymentTarget(filePath) {
    if (!fs.existsSync(filePath))
        return;
    const now = new Date();
    fs.utimesSync(filePath, now, now);
}
function sameFilePath(left, right) {
    return process.platform === 'win32'
        ? left.toLowerCase() === right.toLowerCase()
        : left === right;
}
