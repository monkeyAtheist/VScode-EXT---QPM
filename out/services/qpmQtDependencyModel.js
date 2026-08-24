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
exports.emptyDependencyIntegration = emptyDependencyIntegration;
exports.dependencyIntegrationPath = dependencyIntegrationPath;
exports.readDependencyIntegration = readDependencyIntegration;
exports.writeDependencyIntegration = writeDependencyIntegration;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function emptyDependencyIntegration() {
    return {
        includeDirectories: [], libraryDirectories: [], libraries: [], compilerFlags: [], linkerFlags: [],
        cmakeConfigureArguments: [], cmakeFindPackages: [], cmakeLinkTargets: [], environment: {}
    };
}
function dependencyIntegrationPath(projectRoot, outputDirectory = '.qpm/dependencies') {
    return path.resolve(projectRoot, outputDirectory, 'integration.json');
}
function readDependencyIntegration(projectRoot, outputDirectory = '.qpm/dependencies') {
    const file = dependencyIntegrationPath(projectRoot, outputDirectory);
    if (!fs.existsSync(file))
        return emptyDependencyIntegration();
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        return {
            includeDirectories: strings(raw.includeDirectories),
            libraryDirectories: strings(raw.libraryDirectories),
            libraries: strings(raw.libraries),
            compilerFlags: strings(raw.compilerFlags),
            linkerFlags: strings(raw.linkerFlags),
            cmakeConfigureArguments: strings(raw.cmakeConfigureArguments),
            cmakeFindPackages: strings(raw.cmakeFindPackages),
            cmakeLinkTargets: strings(raw.cmakeLinkTargets),
            environment: objectStrings(raw.environment),
            generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined
        };
    }
    catch {
        return emptyDependencyIntegration();
    }
}
function writeDependencyIntegration(file, integration) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ ...integration, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}
function strings(value) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim()) : [];
}
function objectStrings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    const result = {};
    for (const [key, entry] of Object.entries(value))
        if (typeof entry === 'string')
            result[key] = entry;
    return result;
}
