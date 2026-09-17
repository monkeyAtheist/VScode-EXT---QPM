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
exports.QpmParser = void 0;
exports.defaultFolderForType = defaultFolderForType;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const iniDocument_1 = require("./iniDocument");
const pathUtils_1 = require("../utils/pathUtils");
function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}
function writeText(filePath, content) {
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
    if (current === content) {
        return;
    }
    validateNativeDocument(filePath, content);
    if (current !== undefined && isNativeQpmDocument(filePath)) {
        createNativeBackup(filePath, current);
    }
    const temporaryPath = `${filePath}.vscode-qpm-${process.pid}-${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, content, 'utf8');
    try {
        fs.copyFileSync(temporaryPath, filePath);
    }
    finally {
        try {
            fs.rmSync(temporaryPath, { force: true });
        }
        catch { /* ignored */ }
    }
}
function isNativeQpmDocument(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return extension === '.cws' || extension === '.prj';
}
function validateNativeDocument(filePath, content) {
    if (!isNativeQpmDocument(filePath)) {
        return;
    }
    const document = iniDocument_1.IniDocument.parse(content);
    const requiredSection = path.extname(filePath).toLowerCase() === '.cws' ? 'Workspace Header' : 'Project Header';
    if (!document.getSection(requiredSection)) {
        throw new Error(`Refusing to overwrite ${path.basename(filePath)}: generated content is missing [${requiredSection}].`);
    }
}
function createNativeBackup(filePath, content) {
    const backupDirectory = path.join(path.dirname(filePath), '.vscode', 'qpm-native-backups');
    fs.mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDirectory, `${path.basename(filePath)}.${stamp}.bak`);
    fs.writeFileSync(backupPath, content, 'utf8');
    const prefix = `${path.basename(filePath)}.`;
    const backups = fs.readdirSync(backupDirectory)
        .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'))
        .sort();
    while (backups.length > 20) {
        const oldest = backups.shift();
        if (oldest) {
            try {
                fs.rmSync(path.join(backupDirectory, oldest), { force: true });
            }
            catch { /* ignored */ }
        }
    }
    return backupPath;
}
function deletePossiblyLongValue(section, key) {
    section.delete(key);
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    section.deleteMatching(new RegExp(`^\\s*${escapedKey} Line\\d{4}\\s*=`, 'i'));
}
function setPossiblyLongRuntimePathValue(section, key, value) {
    setPossiblyLongStringValue(section, key, (0, pathUtils_1.toQpmRuntimeStoragePath)(value));
}
function reconstructValue(section, key) {
    const direct = section.get(key);
    if (direct !== undefined) {
        return (0, pathUtils_1.unquote)(direct);
    }
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linePattern = new RegExp(`^${escapedKey} Line(\\d{4})$`, 'i');
    const parts = section.entries()
        .map(({ key: entryKey, value }) => {
        const match = entryKey.match(linePattern);
        return match ? { index: Number(match[1]), value: (0, pathUtils_1.unquote)(value) ?? '' } : undefined;
    })
        .filter((entry) => entry !== undefined)
        .sort((a, b) => a.index - b.index);
    return parts.length > 0 ? parts.map((entry) => entry.value).join('') : undefined;
}
function setPossiblyLongValue(section, key, value) {
    section.delete(key);
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    section.deleteMatching(new RegExp(`^\\s*${escapedKey} Line\\d{4}\\s*=`, 'i'));
    const qpmValue = (0, pathUtils_1.toQpmPath)(value);
    const chunks = (0, pathUtils_1.splitQpmLongValue)(qpmValue);
    if (chunks.length === 1) {
        section.set(key, (0, pathUtils_1.quote)(chunks[0]));
        return;
    }
    chunks.forEach((chunk, index) => section.set(`${key} Line${String(index + 1).padStart(4, '0')}`, (0, pathUtils_1.quote)(chunk)));
}
function setPossiblyLongStringValue(section, key, value) {
    section.delete(key);
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    section.deleteMatching(new RegExp(`^\\s*${escapedKey} Line\\d{4}\\s*=`, 'i'));
    const chunks = (0, pathUtils_1.splitQpmLongValue)(value);
    if (chunks.length === 1) {
        section.set(key, (0, pathUtils_1.quote)(chunks[0]));
        return;
    }
    chunks.forEach((chunk, index) => section.set(`${key} Line${String(index + 1).padStart(4, '0')}`, (0, pathUtils_1.quote)(chunk)));
}
function getProjectModeSection(document, mode) {
    const sectionName = `Default Build Config ${modeSuffix(mode)}`;
    const section = document.getSection(sectionName);
    if (!section) {
        throw new Error(`Invalid Qt project: missing [${sectionName}].`);
    }
    return section;
}
function setBoolean(section, key, value) {
    section.set(key, value ? 'True' : 'False');
}
function parseStringList(section, keyPattern) {
    if (!section) {
        return [];
    }
    return section.entries()
        .filter(({ key }) => keyPattern.test(key))
        .sort((left, right) => numericSuffix(left.key) - numericSuffix(right.key))
        .map(({ value }) => (0, pathUtils_1.unquote)(value) ?? '')
        .filter(Boolean);
}
function writeStringList(section, prefix, values, withRelativeFlag = false) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    section.deleteMatching(new RegExp(`^\\s*${escapedPrefix} \\d{4}(?: Is Rel)?\\s*=`, 'i'));
    values.map((value) => value.trim()).filter(Boolean).forEach((value, index) => {
        const suffix = String(index + 1).padStart(4, '0');
        if (withRelativeFlag) {
            section.set(`${prefix} ${suffix} Is Rel`, 'False');
        }
        section.set(`${prefix} ${suffix}`, (0, pathUtils_1.quote)(value));
    });
}
function resolveStoredPath(section, key) {
    const value = reconstructValue(section, key) ?? '';
    return value ? (0, pathUtils_1.fromQpmPath)(value) : '';
}
function setProjectReferencedPath(section, key, projectPath, value) {
    const trimmed = value.trim();
    deletePossiblyLongValue(section, `${key} Rel Path`);
    section.delete(`${key} Rel To`);
    if (!trimmed) {
        section.set(`${key} Is Rel`, 'False');
        setPossiblyLongStringValue(section, key, '');
        return;
    }
    const projectDirectory = path.dirname(projectPath);
    const absolutePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(projectDirectory, trimmed);
    const relativePath = (0, pathUtils_1.normalizeRelativePath)(projectDirectory, absolutePath);
    section.set(`${key} Is Rel`, 'True');
    section.set(`${key} Rel To`, (0, pathUtils_1.quote)('Project'));
    setPossiblyLongStringValue(section, `${key} Rel Path`, relativePath);
    setPossiblyLongValue(section, key, absolutePath);
}
function setOutputPath(section, mode, projectPath, value) {
    const suffix = modeSuffix(mode);
    const key = `Executable File_${suffix}`;
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('The target output path cannot be empty.');
    }
    const projectDirectory = path.dirname(projectPath);
    const absolutePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(projectDirectory, trimmed);
    section.set(`${key} Is Rel`, 'True');
    section.set(`${key} Rel To`, (0, pathUtils_1.quote)('Project'));
    setPossiblyLongStringValue(section, `${key} Rel Path`, (0, pathUtils_1.normalizeRelativePath)(projectDirectory, absolutePath));
    setPossiblyLongValue(section, key, absolutePath);
}
function collectConfiguredRunValues(document) {
    const result = new Map();
    for (const section of document.sections) {
        const match = section.name.match(/^Default Build Config (\d{4}) (?:Debug|Release|Debug64|Release64)$/i);
        if (!match) {
            continue;
        }
        let valuesByKey = result.get(match[1]);
        if (!valuesByKey) {
            valuesByKey = new Map();
            result.set(match[1], valuesByKey);
        }
        for (const key of ['Command Line Args', 'Working Directory', 'Environment Options', 'External Process Path']) {
            const value = reconstructValue(section, key) ?? '';
            if (!value) {
                continue;
            }
            let values = valuesByKey.get(key);
            if (!values) {
                values = new Set();
                valuesByKey.set(key, values);
            }
            values.add(value);
        }
    }
    return result;
}
function parseBoolean(value, fallback = false) {
    if (!value) {
        return fallback;
    }
    return value.trim().toLowerCase() === 'true';
}
function fileTypeForPath(filePath) {
    switch (path.extname(filePath).toLowerCase()) {
        case '.c':
        case '.cc':
        case '.cpp':
        case '.cxx': return 'CSource';
        case '.h':
        case '.hh':
        case '.hpp':
        case '.hxx': return 'Include';
        case '.uir': return 'User Interface Resource';
        case '.fp': return 'Function Panel';
        case '.lib':
        case '.a': return 'Library';
        case '.obj':
        case '.o': return 'Object';
        default: return 'Other';
    }
}
function defaultFolderForType(fileType) {
    switch (fileType) {
        case 'CSource': return 'Source Files';
        case 'Include': return 'Include Files';
        case 'User Interface Resource': return 'User Interface Files';
        case 'Function Panel': return 'Instrument Files';
        case 'Library': return 'Library Files';
        default: return 'Other Files';
    }
}
function resolveProjectFilePath(projectPath, section) {
    const projectDirectory = path.dirname(projectPath);
    const relativePath = (0, pathUtils_1.unquote)(section.get('Path Rel Path'));
    const isRelative = parseBoolean(section.get('Path Is Rel'), relativePath !== undefined);
    const relativeTo = (0, pathUtils_1.unquote)(section.get('Path Rel To'))?.toLowerCase();
    if (relativePath && isRelative && (!relativeTo || relativeTo === 'project')) {
        return { absolutePath: path.resolve(projectDirectory, relativePath), relativePath };
    }
    const absoluteValue = reconstructValue(section, 'Path');
    if (absoluteValue) {
        return { absolutePath: (0, pathUtils_1.fromQpmPath)(absoluteValue), relativePath };
    }
    if (relativePath) {
        return { absolutePath: path.resolve(projectDirectory, relativePath), relativePath };
    }
    return { absolutePath: path.join(projectDirectory, `unknown-${section.name}`) };
}
function modeSuffix(mode) {
    switch (mode) {
        case 'debug': return 'Debug';
        case 'release': return 'Release';
        case 'debug64': return 'Debug64';
        case 'release64': return 'Release64';
    }
}
function replaceExtension(filePath, extension) {
    return path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}${extension}`);
}
function normalizeLogicalFolder(value) {
    return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/').trim();
}
function isSameOrDescendantFolder(candidate, parent) {
    const normalizedCandidate = normalizeLogicalFolder(candidate).toLowerCase();
    const normalizedParent = normalizeLogicalFolder(parent).toLowerCase();
    return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}
function replaceFolderPrefix(candidate, oldPrefix, newPrefix) {
    const suffix = normalizeLogicalFolder(candidate).slice(normalizeLogicalFolder(oldPrefix).length).replace(/^\/+/, '');
    return [normalizeLogicalFolder(newPrefix), suffix].filter(Boolean).join('/');
}
function numericSuffix(value) {
    const match = value.match(/(\d+)$/);
    return match ? Number(match[1]) : 0;
}
const WORKSPACE_BUILD_MODES = ['Debug', 'Release', 'Debug64', 'Release64'];
function workspaceProjectSuffix(projectIndex) {
    return String(projectIndex).padStart(4, '0');
}
function addWorkspaceSectionIfMissing(document, section, changes, beforePattern) {
    if (document.getSection(section.name)) {
        return;
    }
    if (beforePattern) {
        const insertionIndex = document.sections.findIndex((candidate) => beforePattern.test(candidate.name));
        if (insertionIndex >= 0) {
            document.sections.splice(insertionIndex, 0, section);
        }
        else {
            document.addSection(section);
        }
    }
    else {
        document.addSection(section);
    }
    changes.push(`[${section.name}] added.`);
}
function createWorkspaceProjectHeader(projectIndex, version) {
    const suffix = workspaceProjectSuffix(projectIndex);
    const section = new iniDocument_1.IniSection(`Project Header ${suffix}`, []);
    section.set('Version', String(version));
    section.set("Don't Update DistKit", 'False');
    section.set('Platform Code', '4');
    section.set('Build Configuration', (0, pathUtils_1.quote)('Debug'));
    section.set('Warn User If Debugging Release', '1');
    section.set('Batch Build Release', 'False');
    section.set('Batch Build Debug', 'False');
    section.set('Force Rebuild', 'False');
    section.lines.push('');
    return section;
}
function createWorkspaceDefaultBuildConfig(projectIndex, mode) {
    const suffix = workspaceProjectSuffix(projectIndex);
    const section = new iniDocument_1.IniSection(`Default Build Config ${suffix} ${mode}`, []);
    section.set('Generate Browse Info', 'True');
    section.set('Enable Uninitialized Locals Runtime Warning', 'True');
    section.set('Batch Build', 'False');
    section.set('Profile', (0, pathUtils_1.quote)('Disabled'));
    section.set('Debugging Level', (0, pathUtils_1.quote)('Standard'));
    section.set('Execution Trace', (0, pathUtils_1.quote)('Disabled'));
    section.set('Command Line Args', (0, pathUtils_1.quote)(''));
    section.set('Working Directory', (0, pathUtils_1.quote)(''));
    section.set('Environment Options', (0, pathUtils_1.quote)(''));
    section.set('External Process Path', (0, pathUtils_1.quote)(''));
    section.lines.push('');
    return section;
}
function createWorkspaceBuildDependencies(projectIndex) {
    const suffix = workspaceProjectSuffix(projectIndex);
    const section = new iniDocument_1.IniSection(`Build Dependencies ${suffix}`, []);
    section.set('Number of Dependencies', '0');
    section.lines.push('');
    return section;
}
function createWorkspaceBuildOptions(projectIndex) {
    const suffix = workspaceProjectSuffix(projectIndex);
    const section = new iniDocument_1.IniSection(`Build Options ${suffix}`, []);
    section.set('Generate Browse Info', 'True');
    section.set('Enable Uninitialized Locals Runtime Warning', 'True');
    section.set('Execution Trace', (0, pathUtils_1.quote)('Disabled'));
    section.set('Profile', (0, pathUtils_1.quote)('Disabled'));
    section.set('Debugging Level', (0, pathUtils_1.quote)('Standard'));
    section.set('Break On Library Errors', 'True');
    section.set('Break On First Chance Exceptions', 'False');
    section.lines.push('');
    return section;
}
function createWorkspaceExecutionTarget(projectIndex) {
    const suffix = workspaceProjectSuffix(projectIndex);
    const section = new iniDocument_1.IniSection(`Execution Target ${suffix}`, []);
    section.set('Execution Target Address', (0, pathUtils_1.quote)('Local desktop computer'));
    section.set('Execution Target Port', '0');
    section.set('Execution Target Type', '0');
    section.lines.push('');
    return section;
}
function createWorkspaceSccOptions(projectIndex) {
    const suffix = workspaceProjectSuffix(projectIndex);
    const section = new iniDocument_1.IniSection(`SCC Options ${suffix}`, []);
    section.set('Use global settings', 'True');
    section.set('SCC Provider', (0, pathUtils_1.quote)(''));
    section.set('SCC Project', (0, pathUtils_1.quote)(''));
    section.set('Local Path', (0, pathUtils_1.quote)(''));
    section.set('Auxiliary Path', (0, pathUtils_1.quote)(''));
    section.set('Perform Same Action For .h File As For .uir File', (0, pathUtils_1.quote)('Ask'));
    section.set('Perform Same Action For .cds File As For .prj File', (0, pathUtils_1.quote)('Ask'));
    section.set('Username', (0, pathUtils_1.quote)(''));
    section.set('Comment', (0, pathUtils_1.quote)(''));
    section.set('Use Default Username', 'False');
    section.set('Use Default Comment', 'False');
    section.set('Suppress QPM Error Messages', 'False');
    section.set('Always show confirmation dialog', 'True');
    section.lines.push('');
    return section;
}
function createWorkspaceDllDebuggingSupport(projectIndex) {
    const suffix = workspaceProjectSuffix(projectIndex);
    const section = new iniDocument_1.IniSection(`DLL Debugging Support ${suffix}`, []);
    section.set('External Process Path', (0, pathUtils_1.quote)(''));
    section.lines.push('');
    return section;
}
function createWorkspaceCommandLineArgs(projectIndex) {
    const suffix = workspaceProjectSuffix(projectIndex);
    const section = new iniDocument_1.IniSection(`Command Line Args ${suffix}`, []);
    section.set('Command Line Args', (0, pathUtils_1.quote)(''));
    section.set('Working Directory', (0, pathUtils_1.quote)(''));
    section.set('Environment Options', (0, pathUtils_1.quote)(''));
    section.lines.push('');
    return section;
}
function workspaceUsesBuildDependencies(document, version) {
    return version >= 2000 || document.sections.some((section) => /^Build Dependencies \d{4}$/i.test(section.name));
}
function requiredWorkspaceProjectSectionNames(document, projectIndex, version) {
    const suffix = workspaceProjectSuffix(projectIndex);
    return [
        `Project Header ${suffix}`,
        ...WORKSPACE_BUILD_MODES.map((mode) => `Default Build Config ${suffix} ${mode}`),
        ...(workspaceUsesBuildDependencies(document, version) ? [`Build Dependencies ${suffix}`] : []),
        `Build Options ${suffix}`,
        `Execution Target ${suffix}`,
        `SCC Options ${suffix}`,
        `DLL Debugging Support ${suffix}`,
        `Command Line Args ${suffix}`
    ];
}
function ensureWorkspaceProjectSections(document, projectIndex, version) {
    const changes = [];
    addWorkspaceSectionIfMissing(document, createWorkspaceProjectHeader(projectIndex, version), changes, /^(?:File \d{4}|Default Build Config \d{4} )/i);
    for (const mode of WORKSPACE_BUILD_MODES) {
        addWorkspaceSectionIfMissing(document, createWorkspaceDefaultBuildConfig(projectIndex, mode), changes);
    }
    if (workspaceUsesBuildDependencies(document, version)) {
        addWorkspaceSectionIfMissing(document, createWorkspaceBuildDependencies(projectIndex), changes);
    }
    addWorkspaceSectionIfMissing(document, createWorkspaceBuildOptions(projectIndex), changes);
    addWorkspaceSectionIfMissing(document, createWorkspaceExecutionTarget(projectIndex), changes);
    addWorkspaceSectionIfMissing(document, createWorkspaceSccOptions(projectIndex), changes);
    addWorkspaceSectionIfMissing(document, createWorkspaceDllDebuggingSupport(projectIndex), changes);
    addWorkspaceSectionIfMissing(document, createWorkspaceCommandLineArgs(projectIndex), changes);
    return changes;
}
function normalizeComparablePath(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    const normalized = /^[A-Za-z]:[\\/]/.test(trimmed)
        ? path.win32.normalize(trimmed)
        : path.resolve(trimmed);
    return normalized.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
function qpmWorkspaceFileType(projectFileType, filePath) {
    if (projectFileType === 'CSource' || /\.(?:c|cc|cpp|cxx)$/i.test(filePath)) {
        return 'CSource';
    }
    if (projectFileType === 'Include' || /\.(?:h|hh|hpp|hxx)$/i.test(filePath)) {
        return 'Include';
    }
    return projectFileType || 'Other';
}
function isBreakpointCompatibleProjectFile(file) {
    return file.type === 'CSource' || file.type === 'Include' || /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx)$/i.test(file.absolutePath);
}
function readWorkspaceFilePath(section) {
    const value = reconstructValue(section, 'Path');
    return value ? (0, pathUtils_1.fromQpmPath)(value) : undefined;
}
function parseWorkspaceBreakpointLine(value) {
    const rendered = (0, pathUtils_1.unquote)(value);
    const first = rendered?.split(',')[0]?.trim();
    if (!first || !/^\d+$/.test(first)) {
        return undefined;
    }
    const line = Number(first);
    return line > 0 ? line : undefined;
}
function readWorkspaceBreakpoints(section) {
    const result = new Map();
    for (const line of section.lines) {
        const match = line.match(/^\s*Breakpoint\s+\d{4}\s*=\s*(.*)$/i);
        const sourceLine = parseWorkspaceBreakpointLine(match?.[1]);
        if (match && sourceLine !== undefined && !result.has(sourceLine)) {
            result.set(sourceLine, match[1].trim());
        }
    }
    return result;
}
function replaceWorkspaceBreakpoints(section, values) {
    section.deleteMatching(/^\s*Breakpoint\s+\d{4}\s*=/i);
    const entries = [...values.entries()].sort(([left], [right]) => left - right);
    if (entries.length === 0) {
        return;
    }
    let insertionIndex = section.lines.findIndex((line) => /^\s*(?:Tracepoint\s+\d{4}|Window\s+)/i.test(line));
    if (insertionIndex < 0) {
        insertionIndex = section.lines.length;
        while (insertionIndex > 0 && section.lines[insertionIndex - 1].trim() === '') {
            insertionIndex -= 1;
        }
    }
    const rendered = entries.map(([, value], index) => `Breakpoint ${String(index + 1).padStart(4, '0')} = ${value}`);
    section.lines.splice(insertionIndex, 0, ...rendered);
}
function nextWorkspaceFileIndex(document) {
    return document.sections
        .filter((section) => /^File \d{4}$/i.test(section.name))
        .map((section) => numericSuffix(section.name))
        .reduce((maximum, value) => Math.max(maximum, value), 0) + 1;
}
function ensureWorkspaceFileSection(document, header, projectIndex, projectFile) {
    const comparable = normalizeComparablePath(projectFile.absolutePath);
    const existing = document.sections.find((section) => /^File \d{4}$/i.test(section.name)
        && normalizeComparablePath(readWorkspaceFilePath(section) ?? '') === comparable);
    if (existing) {
        return { section: existing, created: false };
    }
    const index = nextWorkspaceFileIndex(document);
    const section = new iniDocument_1.IniSection(`File ${String(index).padStart(4, '0')}`, []);
    section.set('Path', (0, pathUtils_1.quote)((0, pathUtils_1.toQpmPath)(projectFile.absolutePath)));
    section.set('File Type', (0, pathUtils_1.quote)(qpmWorkspaceFileType(projectFile.type, projectFile.absolutePath)));
    section.set('In Projects', (0, pathUtils_1.quote)(`${projectIndex},`));
    section.lines.push('');
    const tabOrderIndex = document.sections.findIndex((candidate) => candidate.name.toLowerCase() === 'tab order');
    const buildConfigIndex = document.sections.findIndex((candidate) => /^Default Build Config \d{4} /i.test(candidate.name));
    const insertionIndex = tabOrderIndex >= 0 ? tabOrderIndex : buildConfigIndex >= 0 ? buildConfigIndex : document.sections.length;
    document.sections.splice(insertionIndex, 0, section);
    header.set('Number of Opened Files', String(document.sections.filter((candidate) => /^File \d{4}$/i.test(candidate.name)).length));
    return { section, created: true };
}
class QpmParser {
    parseWorkspace(workspacePath) {
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const header = document.getSection('Workspace Header');
        if (!header) {
            throw new Error(`Invalid Qt workspace: missing [Workspace Header] in ${workspacePath}`);
        }
        const numberOfProjects = Number(header.get('Number of Projects') ?? '0');
        const activeProjectIndex = Number(header.get('Active Project') ?? (numberOfProjects > 0 ? '1' : '0'));
        const workspaceDirectory = path.dirname(workspacePath);
        const projects = [];
        for (let index = 1; index <= numberOfProjects; index += 1) {
            const key = `Project ${String(index).padStart(4, '0')}`;
            const relativePath = (0, pathUtils_1.unquote)(header.get(key));
            if (!relativePath) {
                continue;
            }
            const absolutePath = path.resolve(workspaceDirectory, relativePath);
            const exists = fs.existsSync(absolutePath);
            let projectName = path.basename(absolutePath, path.extname(absolutePath));
            if (exists && absolutePath.toLowerCase().endsWith('.qtproject.json')) {
                try {
                    const raw = JSON.parse(readText(absolutePath));
                    if (typeof raw.name === 'string' && raw.name.trim())
                        projectName = raw.name.trim();
                }
                catch {
                    projectName = path.basename(absolutePath).replace(/\.qtproject\.json$/i, '');
                }
            }
            projects.push({ index, relativePath, absolutePath, name: projectName, exists });
        }
        return {
            path: workspacePath,
            name: path.basename(workspacePath, path.extname(workspacePath)),
            activeProjectIndex,
            projects,
            qpmDir: reconstructValue(header, 'QPM Dir') ? (0, pathUtils_1.fromQpmPath)(reconstructValue(header, 'QPM Dir')) : undefined
        };
    }
    parseStandaloneProject(projectPath) {
        return {
            path: projectPath,
            name: path.basename(projectPath, path.extname(projectPath)),
            activeProjectIndex: 1,
            projects: [{
                    index: 1,
                    relativePath: path.basename(projectPath),
                    absolutePath: projectPath,
                    name: path.basename(projectPath, path.extname(projectPath)),
                    exists: fs.existsSync(projectPath)
                }]
        };
    }
    parseProject(projectPath) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const header = document.getSection('Project Header');
        if (!header) {
            throw new Error(`Invalid Qt project: missing [Project Header] in ${projectPath}`);
        }
        const files = document.sections
            .filter((section) => /^File \d{4}$/i.test(section.name))
            .map((section) => {
            const id = Number(section.name.match(/\d{4}/)?.[0] ?? section.get('Res Id') ?? '0');
            const resolved = resolveProjectFilePath(projectPath, section);
            return {
                sectionName: section.name,
                id,
                type: (0, pathUtils_1.unquote)(section.get('File Type')) ?? 'Other',
                folder: (0, pathUtils_1.unquote)(section.get('Folder')) ?? defaultFolderForType((0, pathUtils_1.unquote)(section.get('File Type')) ?? 'Other'),
                relativePath: resolved.relativePath,
                absolutePath: resolved.absolutePath,
                excluded: parseBoolean(section.get('Exclude')),
                compileIntoObjectFile: parseBoolean(section.get('Compile Into Object File')),
                exists: fs.existsSync(resolved.absolutePath)
            };
        })
            .sort((a, b) => a.id - b.id);
        const foldersSection = document.getSection('Folders');
        const folders = foldersSection
            ? foldersSection.entries()
                .filter(({ key }) => /^Folder \d+$/i.test(key))
                .map(({ value }) => (0, pathUtils_1.unquote)(value) ?? '')
                .filter(Boolean)
            : [];
        return {
            path: projectPath,
            name: path.basename(projectPath, path.extname(projectPath)),
            targetType: (0, pathUtils_1.unquote)(header.get('Target Type')) ?? 'Unknown',
            qpmDir: reconstructValue(header, 'QPM Dir') ? (0, pathUtils_1.fromQpmPath)(reconstructValue(header, 'QPM Dir')) : undefined,
            folders,
            files
        };
    }
    getNativeTargetSettings(projectPath, mode) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const header = document.getSection('Project Header');
        if (!header) {
            throw new Error('Invalid Qt project: missing [Project Header].');
        }
        const config = getProjectModeSection(document, mode);
        const createExecutable = document.getSection('Create Executable') ?? new iniDocument_1.IniSection('Create Executable', []);
        const modules = document.getSection('Modules Forced Into Executable');
        const signing = document.getSection('Signing Info') ?? new iniDocument_1.IniSection('Signing Info', []);
        const versionValue = (key) => (0, pathUtils_1.unquote)(config.get(`${key} Ex`)) ?? (0, pathUtils_1.unquote)(config.get(key)) ?? '';
        const outputKey = `Executable File_${modeSuffix(mode)}`;
        return {
            targetType: (0, pathUtils_1.unquote)(header.get('Target Type')) ?? 'Executable',
            outputPath: resolveStoredPath(createExecutable, outputKey),
            applicationTitle: (0, pathUtils_1.unquote)(config.get('Application Title')) ?? '',
            iconFile: resolveStoredPath(config, 'Icon File'),
            runtimeSupport: (0, pathUtils_1.unquote)(config.get('Runtime Support')) ?? 'Full Runtime Support',
            runtimeBinding: (0, pathUtils_1.unquote)(config.get('Runtime Binding')) ?? 'Shared',
            generateSourceDocumentation: (0, pathUtils_1.unquote)(config.get('Generate Source Documentation')) ?? 'None',
            manifestEmbed: parseBoolean(config.get('Manifest Embed')),
            manifestPath: resolveStoredPath(config, 'Manifest Path'),
            embedProjectUirs: parseBoolean(config.get('Embed Project .UIRs')),
            generateMapFile: parseBoolean(config.get('Generate Map File')),
            createConsoleApplication: parseBoolean(config.get('Create Console Application')),
            embedTimestamp: parseBoolean(config.get('Embed Timestamp'), true),
            usingLoadExternalModule: parseBoolean(config.get('Using LoadExternalModule')),
            forcedModules: parseStringList(modules, /^Module \d{4}$/i),
            useDefaultImportLibBaseName: parseBoolean(config.get('Use Dflt Import Lib Base Name'), true),
            importLibBaseName: (0, pathUtils_1.unquote)(config.get('Import Lib Base Name')) ?? '',
            whereToCopyDll: (0, pathUtils_1.unquote)(config.get('Where to Copy DLL')) ?? 'Do not copy',
            customDirectoryToCopyDll: resolveStoredPath(config, 'Custom Directory to Copy DLL'),
            useIviSubdirectoriesForImportLibraries: parseBoolean(config.get('Use IVI Subdirectories for Import Libraries')),
            useVxiPnpSubdirectoriesForImportLibraries: parseBoolean(config.get('Use VXIPNP Subdirectories for Import Libraries')),
            dllExports: (0, pathUtils_1.unquote)(config.get('DLL Exports')) ?? 'Include File Symbols',
            exportFiles: parseStringList(config, /^Export File\d+$/i),
            addTypeLibToDll: parseBoolean(config.get('Add Type Lib To DLL')),
            includeTypeLibHelpLinks: parseBoolean(config.get('Include Type Lib Help Links')),
            tlbHelpStyle: (0, pathUtils_1.unquote)(config.get('TLB Help Style')) ?? 'HLP',
            typeLibFpFile: resolveStoredPath(config, 'Type Lib FP File'),
            addNiTypeInfoToDll: parseBoolean(config.get('Add NI Type Info To DLL')),
            useSingleHeaderForNiTypeInfo: parseBoolean(config.get('Use Single Header for NI Type Info')),
            singleHeaderNiTypeInfoFile: resolveStoredPath(config, 'Single Header NI Type Info File'),
            versionInfo: {
                numericFileVersion: (0, pathUtils_1.unquote)(config.get('Numeric File Version')) ?? '1,0,0,0',
                numericProductVersion: (0, pathUtils_1.unquote)(config.get('Numeric Prod Version')) ?? '1,0,0,0',
                comments: versionValue('Comments'),
                companyName: versionValue('Company Name'),
                fileDescription: versionValue('File Description'),
                fileVersion: versionValue('File Version'),
                internalName: versionValue('Internal Name'),
                legalCopyright: versionValue('Legal Copyright'),
                legalTrademarks: versionValue('Legal Trademarks'),
                originalFilename: versionValue('Original Filename'),
                privateBuild: versionValue('Private Build'),
                productName: versionValue('Product Name'),
                productVersion: versionValue('Product Version'),
                specialBuild: versionValue('Special Build')
            },
            signing: {
                enabled: parseBoolean(config.get('Sign')),
                store: (0, pathUtils_1.unquote)(config.get('Sign Store')) ?? '',
                certificate: (0, pathUtils_1.unquote)(config.get('Sign Certificate')) ?? '',
                timestampUrl: (0, pathUtils_1.unquote)(config.get('Sign Timestamp URL')) ?? '',
                descriptionUrl: (0, pathUtils_1.unquote)(config.get('Sign URL')) ?? '',
                signDebugBuild: parseBoolean(signing.get('Sign Debug Build'))
            }
        };
    }
    setNativeTargetSettings(projectPath, mode, settings) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const header = document.getSection('Project Header');
        if (!header) {
            throw new Error('Invalid Qt project: missing [Project Header].');
        }
        const config = getProjectModeSection(document, mode);
        const createExecutable = document.ensureSection('Create Executable');
        const signing = document.ensureSection('Signing Info');
        setOutputPath(createExecutable, mode, projectPath, settings.outputPath);
        config.set('Application Title', (0, pathUtils_1.quote)(settings.applicationTitle));
        setProjectReferencedPath(config, 'Icon File', projectPath, settings.iconFile);
        config.set('Runtime Support', (0, pathUtils_1.quote)(settings.runtimeSupport));
        config.set('Runtime Binding', (0, pathUtils_1.quote)(settings.runtimeBinding));
        config.set('Generate Source Documentation', (0, pathUtils_1.quote)(settings.generateSourceDocumentation));
        setBoolean(config, 'Manifest Embed', settings.manifestEmbed);
        setProjectReferencedPath(config, 'Manifest Path', projectPath, settings.manifestPath);
        setBoolean(config, 'Embed Project .UIRs', settings.embedProjectUirs);
        setBoolean(config, 'Generate Map File', settings.generateMapFile);
        setBoolean(config, 'Create Console Application', settings.createConsoleApplication);
        setBoolean(config, 'Embed Timestamp', settings.embedTimestamp);
        setBoolean(config, 'Using LoadExternalModule', settings.usingLoadExternalModule);
        const modules = document.ensureSection('Modules Forced Into Executable', 'ActiveX Server Options');
        writeStringList(modules, 'Module', settings.forcedModules, true);
        if (settings.forcedModules.filter((value) => value.trim()).length === 0) {
            document.removeSection('Modules Forced Into Executable');
        }
        setBoolean(config, 'Use Dflt Import Lib Base Name', settings.useDefaultImportLibBaseName);
        config.set('Import Lib Base Name', (0, pathUtils_1.quote)(settings.importLibBaseName));
        config.set('Where to Copy DLL', (0, pathUtils_1.quote)(settings.whereToCopyDll));
        setProjectReferencedPath(config, 'Custom Directory to Copy DLL', projectPath, settings.customDirectoryToCopyDll);
        setBoolean(config, 'Use IVI Subdirectories for Import Libraries', settings.useIviSubdirectoriesForImportLibraries);
        setBoolean(config, 'Use VXIPNP Subdirectories for Import Libraries', settings.useVxiPnpSubdirectoriesForImportLibraries);
        config.set('DLL Exports', (0, pathUtils_1.quote)(settings.dllExports));
        writeStringList(config, 'Export File', settings.exportFiles);
        setBoolean(config, 'Add Type Lib To DLL', settings.addTypeLibToDll);
        setBoolean(config, 'Include Type Lib Help Links', settings.includeTypeLibHelpLinks);
        config.set('TLB Help Style', (0, pathUtils_1.quote)(settings.tlbHelpStyle));
        setProjectReferencedPath(config, 'Type Lib FP File', projectPath, settings.typeLibFpFile);
        setBoolean(config, 'Add NI Type Info To DLL', settings.addNiTypeInfoToDll);
        setBoolean(config, 'Use Single Header for NI Type Info', settings.useSingleHeaderForNiTypeInfo);
        setProjectReferencedPath(config, 'Single Header NI Type Info File', projectPath, settings.singleHeaderNiTypeInfoFile);
        const versionPairs = [
            ['Comments', settings.versionInfo.comments],
            ['Company Name', settings.versionInfo.companyName],
            ['File Description', settings.versionInfo.fileDescription],
            ['File Version', settings.versionInfo.fileVersion],
            ['Internal Name', settings.versionInfo.internalName],
            ['Legal Copyright', settings.versionInfo.legalCopyright],
            ['Legal Trademarks', settings.versionInfo.legalTrademarks],
            ['Original Filename', settings.versionInfo.originalFilename],
            ['Private Build', settings.versionInfo.privateBuild],
            ['Product Name', settings.versionInfo.productName],
            ['Product Version', settings.versionInfo.productVersion],
            ['Special Build', settings.versionInfo.specialBuild]
        ];
        config.set('Numeric File Version', (0, pathUtils_1.quote)(settings.versionInfo.numericFileVersion));
        config.set('Numeric Prod Version', (0, pathUtils_1.quote)(settings.versionInfo.numericProductVersion));
        versionPairs.forEach(([key, value]) => {
            config.set(key, (0, pathUtils_1.quote)(value));
            config.set(`${key} Ex`, (0, pathUtils_1.quote)(value));
        });
        setBoolean(config, 'Sign', settings.signing.enabled);
        config.set('Sign Store', (0, pathUtils_1.quote)(settings.signing.store));
        config.set('Sign Certificate', (0, pathUtils_1.quote)(settings.signing.certificate));
        config.set('Sign Timestamp URL', (0, pathUtils_1.quote)(settings.signing.timestampUrl));
        config.set('Sign URL', (0, pathUtils_1.quote)(settings.signing.descriptionUrl));
        setBoolean(signing, 'Sign Debug Build', settings.signing.signDebugBuild);
        writeText(projectPath, document.toString());
    }
    getTargetPath(projectPath, mode) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const section = document.getSection('Create Executable');
        if (!section) {
            return undefined;
        }
        const suffix = modeSuffix(mode);
        const relativePath = (0, pathUtils_1.unquote)(section.get(`Executable File_${suffix} Rel Path`));
        if (relativePath) {
            return path.resolve(path.dirname(projectPath), relativePath);
        }
        const absolute = reconstructValue(section, `Executable File_${suffix}`);
        return absolute ? (0, pathUtils_1.fromQpmPath)(absolute) : undefined;
    }
    getWorkspaceRunOptions(workspacePath, projectIndex, mode = 'debug') {
        if (path.extname(workspacePath).toLowerCase() !== '.cws') {
            return { arguments: '', workingDirectory: '', environmentOptions: '', externalProcessPath: '', outputMode: 'integrated-terminal' };
        }
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const suffix = String(projectIndex).padStart(4, '0');
        const modeSection = document.getSection(`Default Build Config ${suffix} ${modeSuffix(mode)}`);
        const section = document.getSection(`Command Line Args ${suffix}`);
        const dllSection = document.getSection(`DLL Debugging Support ${suffix}`);
        const value = (key) => reconstructValue(modeSection ?? new iniDocument_1.IniSection('', []), key)
            ?? reconstructValue(section ?? new iniDocument_1.IniSection('', []), key)
            ?? '';
        return {
            arguments: value('Command Line Args'),
            workingDirectory: value('Working Directory'),
            environmentOptions: value('Environment Options'),
            externalProcessPath: value('External Process Path') || reconstructValue(dllSection ?? new iniDocument_1.IniSection('', []), 'External Process Path') || '',
            outputMode: 'integrated-terminal'
        };
    }
    setWorkspaceRunOptions(workspacePath, projectIndex, mode, options) {
        if (path.extname(workspacePath).toLowerCase() !== '.cws') {
            return;
        }
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const header = document.getSection('Workspace Header');
        if (!header) {
            throw new Error('Invalid Qt workspace: missing [Workspace Header].');
        }
        const projectCount = Number(header.get('Number of Projects') ?? '0');
        if (projectIndex < 1 || projectIndex > projectCount || !header.has(`Project ${workspaceProjectSuffix(projectIndex)}`)) {
            throw new Error(`Refusing to update QPM run settings: project ${projectIndex} is not declared in the workspace.`);
        }
        const version = Number(header.get('Version') ?? '1200');
        ensureWorkspaceProjectSections(document, projectIndex, version);
        const suffix = workspaceProjectSuffix(projectIndex);
        const sectionName = `Default Build Config ${suffix} ${modeSuffix(mode)}`;
        const config = document.getSection(sectionName);
        if (!config) {
            throw new Error(`Unable to initialize QPM run settings: [${sectionName}] is missing.`);
        }
        // QPM persists run options per build configuration in [Default Build Config ....].
        // Do not mirror values into the legacy [Command Line Args ....] or
        // [DLL Debugging Support ....] sections: rewriting those compatibility
        // sections caused some Qt workspaces to become unreadable.
        setPossiblyLongStringValue(config, 'Command Line Args', options.arguments);
        setPossiblyLongRuntimePathValue(config, 'Working Directory', options.workingDirectory);
        setPossiblyLongStringValue(config, 'Environment Options', options.environmentOptions);
        setPossiblyLongRuntimePathValue(config, 'External Process Path', options.externalProcessPath);
        writeText(workspacePath, document.toString());
    }
    inspectWorkspaceCompatibility(workspacePath) {
        if (path.extname(workspacePath).toLowerCase() !== '.cws' || !fs.existsSync(workspacePath)) {
            return [];
        }
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const issues = [];
        const header = document.getSection('Workspace Header');
        const version = Number(header?.get('Version') ?? '1200');
        const projectCount = Number(header?.get('Number of Projects') ?? '0');
        for (let projectIndex = 1; projectIndex <= projectCount; projectIndex += 1) {
            for (const sectionName of requiredWorkspaceProjectSectionNames(document, projectIndex, version)) {
                if (!document.getSection(sectionName)) {
                    issues.push(`[${sectionName}] is missing for workspace project ${workspaceProjectSuffix(projectIndex)}.`);
                }
            }
        }
        const configuredValues = collectConfiguredRunValues(document);
        for (const section of document.sections) {
            if (/^Default Build Config \d{4} (?:Debug|Release|Debug64|Release64)$/i.test(section.name) || /^DLL Debugging Support \d{4}$/i.test(section.name)) {
                for (const key of ['Working Directory', 'External Process Path']) {
                    const value = reconstructValue(section, key);
                    if (value && (0, pathUtils_1.toQpmRuntimeStoragePath)(value) !== value) {
                        issues.push(`[${section.name}] ${key} uses a non-QPM path representation: ${value}`);
                    }
                }
            }
            const legacyCommandMatch = section.name.match(/^Command Line Args (\d{4})$/i);
            if (legacyCommandMatch) {
                if (reconstructValue(section, 'External Process Path') !== undefined) {
                    issues.push(`[${section.name}] contains an unexpected External Process Path compatibility key.`);
                }
                for (const key of ['Command Line Args', 'Working Directory', 'Environment Options']) {
                    const value = reconstructValue(section, key) ?? '';
                    if (value && configuredValues.get(legacyCommandMatch[1])?.get(key)?.has(value)) {
                        issues.push(`[${section.name}] duplicates per-configuration ${key}.`);
                    }
                }
            }
            const legacyDllMatch = section.name.match(/^DLL Debugging Support (\d{4})$/i);
            if (legacyDllMatch) {
                const value = reconstructValue(section, 'External Process Path') ?? '';
                if (value && configuredValues.get(legacyDllMatch[1])?.get('External Process Path')?.has(value)) {
                    issues.push(`[${section.name}] duplicates a per-configuration External Process Path.`);
                }
            }
        }
        return issues;
    }
    repairWorkspaceCompatibility(workspacePath) {
        if (path.extname(workspacePath).toLowerCase() !== '.cws') {
            throw new Error('Native workspace compatibility repair requires a .cws workspace.');
        }
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const changes = [];
        const normalizePathKey = (section, key) => {
            const current = reconstructValue(section, key);
            if (current === undefined) {
                return;
            }
            const normalized = (0, pathUtils_1.toQpmRuntimeStoragePath)(current);
            if (normalized !== current) {
                setPossiblyLongStringValue(section, key, normalized);
                changes.push(`[${section.name}] ${key}: ${current} -> ${normalized}`);
            }
        };
        for (const section of document.sections) {
            if (/^Default Build Config \d{4} (?:Debug|Release|Debug64|Release64)$/i.test(section.name)) {
                normalizePathKey(section, 'Working Directory');
                normalizePathKey(section, 'External Process Path');
            }
        }
        const configuredValues = collectConfiguredRunValues(document);
        for (const section of document.sections) {
            const legacyCommandMatch = section.name.match(/^Command Line Args (\d{4})$/i);
            if (legacyCommandMatch) {
                normalizePathKey(section, 'Working Directory');
                if (reconstructValue(section, 'External Process Path') !== undefined) {
                    deletePossiblyLongValue(section, 'External Process Path');
                    changes.push(`[${section.name}] removed unexpected External Process Path compatibility key.`);
                }
                for (const key of ['Command Line Args', 'Working Directory', 'Environment Options']) {
                    const current = reconstructValue(section, key) ?? '';
                    if (current && configuredValues.get(legacyCommandMatch[1])?.get(key)?.has(current)) {
                        setPossiblyLongStringValue(section, key, '');
                        changes.push(`[${section.name}] cleared duplicated legacy ${key}.`);
                    }
                }
            }
            const legacyDllMatch = section.name.match(/^DLL Debugging Support (\d{4})$/i);
            if (legacyDllMatch) {
                normalizePathKey(section, 'External Process Path');
                const current = reconstructValue(section, 'External Process Path') ?? '';
                if (current && configuredValues.get(legacyDllMatch[1])?.get('External Process Path')?.has(current)) {
                    setPossiblyLongStringValue(section, 'External Process Path', '');
                    changes.push(`[${section.name}] cleared duplicated legacy External Process Path.`);
                }
            }
        }
        const header = document.getSection('Workspace Header');
        const version = Number(header?.get('Version') ?? '1200');
        const projectCount = Number(header?.get('Number of Projects') ?? '0');
        for (let projectIndex = 1; projectIndex <= projectCount; projectIndex += 1) {
            changes.push(...ensureWorkspaceProjectSections(document, projectIndex, version));
        }
        if (changes.length > 0) {
            writeText(workspacePath, document.toString());
        }
        return { changed: changes.length > 0, changes };
    }
    getProjectBuildActions(projectPath, mode) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const modeName = modeSuffix(mode);
        const readActions = (kind) => {
            const section = document.getSection(`${modeName} ${kind}`);
            if (!section) {
                return { actions: [], present: false };
            }
            const actions = section.entries()
                .filter(({ key }) => /^Build Action\d+$/i.test(key))
                .sort((left, right) => numericSuffix(left.key) - numericSuffix(right.key))
                .map(({ value }) => (0, pathUtils_1.unquote)(value) ?? '')
                .filter(Boolean);
            return { actions, present: true };
        };
        const pre = readActions('Pre-build Actions');
        const custom = readActions('Custom Build Actions');
        const post = readActions('Post-build Actions');
        return {
            preBuildActions: pre.actions,
            customBuildActions: custom.actions,
            postBuildActions: post.actions,
            nativeSectionsPresent: pre.present || custom.present || post.present
        };
    }
    setProjectBuildActions(projectPath, mode, actions) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const modeName = modeSuffix(mode);
        const writeActions = (kind, values) => {
            const sectionName = `${modeName} ${kind}`;
            const normalized = values.map((value) => String(value).trim()).filter(Boolean);
            if (!normalized.length) {
                document.removeSection(sectionName);
                return;
            }
            const section = document.ensureSection(sectionName, 'Signing Info');
            section.deleteMatching(/^\s*Build Action\d+\s*=/i);
            normalized.forEach((value, index) => section.set(`Build Action${index + 1}`, (0, pathUtils_1.quote)(value)));
            if (!section.lines.some((line) => line.trim() === '')) {
                section.lines.push('');
            }
        };
        writeActions('Custom Build Actions', actions.customBuildActions);
        writeActions('Pre-build Actions', actions.preBuildActions);
        writeActions('Post-build Actions', actions.postBuildActions);
        writeText(projectPath, document.toString());
    }
    setTargetType(projectPath, targetType) {
        if (!['Executable', 'Dynamic Link Library', 'Static Library'].includes(targetType)) {
            throw new Error(`Unsupported QPM target type: ${targetType}`);
        }
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const header = document.getSection('Project Header');
        if (!header) {
            throw new Error('Invalid Qt project: missing [Project Header].');
        }
        header.set('Target Type', (0, pathUtils_1.quote)(targetType));
        const target = document.ensureSection('Create Executable');
        const extension = targetType === 'Dynamic Link Library' ? '.dll' : targetType === 'Static Library' ? '.a' : '.exe';
        for (const mode of ['Debug', 'Release', 'Debug64', 'Release64']) {
            const relKey = `Executable File_${mode} Rel Path`;
            const absoluteKey = `Executable File_${mode}`;
            const currentRelative = (0, pathUtils_1.unquote)(target.get(relKey));
            const currentAbsolute = reconstructValue(target, absoluteKey);
            if (currentRelative) {
                target.set(relKey, (0, pathUtils_1.quote)(replaceExtension(currentRelative, extension)));
            }
            else {
                target.set(`Executable File_${mode} Is Rel`, 'True');
                target.set(`Executable File_${mode} Rel To`, (0, pathUtils_1.quote)('Project'));
                target.set(relKey, (0, pathUtils_1.quote)(`${path.basename(projectPath, path.extname(projectPath))}${extension}`));
            }
            if (currentAbsolute) {
                setPossiblyLongValue(target, absoluteKey, replaceExtension(currentAbsolute, extension));
            }
            else {
                setPossiblyLongValue(target, absoluteKey, path.join(path.dirname(projectPath), `${path.basename(projectPath, path.extname(projectPath))}${extension}`));
            }
        }
        writeText(projectPath, document.toString());
    }
    setWorkspaceActiveProject(workspacePath, projectIndex) {
        if (path.extname(workspacePath).toLowerCase() !== '.cws') {
            return;
        }
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const header = document.getSection('Workspace Header');
        if (!header) {
            throw new Error('Invalid Qt workspace: missing [Workspace Header].');
        }
        const projectCount = Number(header.get('Number of Projects') ?? '0');
        if (projectIndex < 1 || projectIndex > projectCount) {
            throw new Error(`Invalid project index ${projectIndex}.`);
        }
        header.set('Active Project', String(projectIndex));
        writeText(workspacePath, document.toString());
    }
    addProjectToWorkspace(workspacePath, projectPath) {
        if (path.extname(workspacePath).toLowerCase() !== '.cws') {
            throw new Error('A standalone .prj cannot contain multiple projects. Open or create a .cws workspace first.');
        }
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const header = document.getSection('Workspace Header');
        if (!header) {
            throw new Error('Invalid Qt workspace: missing [Workspace Header].');
        }
        const workspaceDirectory = path.dirname(workspacePath);
        const relativePath = (0, pathUtils_1.normalizeRelativePath)(workspaceDirectory, projectPath);
        const existing = header.entries().find(({ key, value }) => /^Project \d{4}$/i.test(key) && ((0, pathUtils_1.unquote)(value) ?? '').toLowerCase() === relativePath.toLowerCase());
        if (existing) {
            return Number(existing.key.match(/\d{4}/)?.[0] ?? '1');
        }
        const nextIndex = Number(header.get('Number of Projects') ?? '0') + 1;
        header.set('Number of Projects', String(nextIndex));
        header.set(`Project ${workspaceProjectSuffix(nextIndex)}`, (0, pathUtils_1.quote)(relativePath));
        if (!header.has('Active Project')) {
            header.set('Active Project', '1');
        }
        const version = Number(header.get('Version') ?? '1200');
        ensureWorkspaceProjectSections(document, nextIndex, version);
        writeText(workspacePath, document.toString());
        return nextIndex;
    }
    removeProjectFromWorkspace(workspacePath, projectIndex) {
        if (path.extname(workspacePath).toLowerCase() !== '.cws') {
            throw new Error('Cannot remove the only project from a standalone .prj view.');
        }
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const header = document.getSection('Workspace Header');
        if (!header) {
            throw new Error('Invalid Qt workspace: missing [Workspace Header].');
        }
        const count = Number(header.get('Number of Projects') ?? '0');
        const entries = [];
        for (let index = 1; index <= count; index += 1) {
            const value = header.get(`Project ${String(index).padStart(4, '0')}`);
            if (value && index !== projectIndex) {
                entries.push(value);
            }
        }
        header.deleteMatching(/^\s*Project \d{4}(?:\s+.*)?\s*=/i);
        header.set('Number of Projects', String(entries.length));
        entries.forEach((value, index) => header.set(`Project ${String(index + 1).padStart(4, '0')}`, value));
        const currentActive = Number(header.get('Active Project') ?? '1');
        const nextActive = entries.length === 0 ? 0 : Math.min(currentActive === projectIndex ? 1 : currentActive > projectIndex ? currentActive - 1 : currentActive, entries.length);
        header.set('Active Project', String(nextActive));
        writeText(workspacePath, document.toString());
    }
    addFilesToProject(projectPath, filePaths, folderOverride) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const header = document.getSection('Project Header');
        if (!header) {
            throw new Error('Invalid Qt project: missing [Project Header].');
        }
        const projectDirectory = path.dirname(projectPath);
        const existingFiles = this.parseProject(projectPath).files.map((file) => path.normalize(file.absolutePath).toLowerCase());
        let nextId = document.sections
            .filter((section) => /^File \d{4}$/i.test(section.name))
            .map((section) => Number(section.name.match(/\d{4}/)?.[0] ?? '0'))
            .reduce((max, value) => Math.max(max, value), 0) + 1;
        let added = 0;
        for (const filePath of filePaths) {
            const normalized = path.normalize(filePath).toLowerCase();
            if (existingFiles.includes(normalized)) {
                continue;
            }
            const fileType = fileTypeForPath(filePath);
            const folder = folderOverride?.trim() || defaultFolderForType(fileType);
            const relativePath = (0, pathUtils_1.normalizeRelativePath)(projectDirectory, filePath);
            const sectionName = `File ${String(nextId).padStart(4, '0')}`;
            const section = new iniDocument_1.IniSection(sectionName, []);
            section.set('File Type', (0, pathUtils_1.quote)(fileType));
            section.set('Res Id', String(nextId));
            section.set('Path Is Rel', 'True');
            section.set('Path Rel To', (0, pathUtils_1.quote)('Project'));
            section.set('Path Rel Path', (0, pathUtils_1.quote)(relativePath));
            setPossiblyLongValue(section, 'Path', filePath);
            section.set('Exclude', 'False');
            if (fileType === 'CSource') {
                section.set('Compile Into Object File', 'False');
            }
            section.set('Project Flags', '0');
            section.set('Folder', (0, pathUtils_1.quote)(folder));
            section.lines.push('');
            document.addSection(section, 'Folders');
            this.ensureProjectFolder(document, folder);
            existingFiles.push(normalized);
            nextId += 1;
            added += 1;
        }
        header.set('Number of Files', String(Number(header.get('Number of Files') ?? '0') + added));
        writeText(projectPath, document.toString());
        return added;
    }
    removeFileFromProject(projectPath, sectionName) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const header = document.getSection('Project Header');
        if (!header) {
            throw new Error('Invalid Qt project: missing [Project Header].');
        }
        if (!document.getSection(sectionName)) {
            return;
        }
        document.removeSection(sectionName);
        const remaining = document.sections.filter((section) => /^File \d{4}$/i.test(section.name));
        header.set('Number of Files', String(remaining.length));
        writeText(projectPath, document.toString());
    }
    addFolderToProject(projectPath, folder) {
        const normalizedFolder = normalizeLogicalFolder(folder);
        if (!normalizedFolder) {
            throw new Error('A non-empty QPM logical folder name is required.');
        }
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        this.ensureProjectFolder(document, normalizedFolder);
        writeText(projectPath, document.toString());
    }
    renameFolderInProject(projectPath, oldFolder, newFolder) {
        const oldNormalized = normalizeLogicalFolder(oldFolder);
        const newNormalized = normalizeLogicalFolder(newFolder);
        if (!oldNormalized || !newNormalized) {
            throw new Error('Both QPM logical folder names are required.');
        }
        if (oldNormalized.toLowerCase() === newNormalized.toLowerCase()) {
            return;
        }
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        for (const section of document.sections.filter((candidate) => /^File \d{4}$/i.test(candidate.name))) {
            const current = normalizeLogicalFolder((0, pathUtils_1.unquote)(section.get('Folder')) ?? '');
            if (isSameOrDescendantFolder(current, oldNormalized)) {
                section.set('Folder', (0, pathUtils_1.quote)(replaceFolderPrefix(current, oldNormalized, newNormalized)));
            }
        }
        this.rewriteDeclaredFolders(document, (folder) => isSameOrDescendantFolder(folder, oldNormalized)
            ? replaceFolderPrefix(folder, oldNormalized, newNormalized)
            : folder);
        this.ensureProjectFolder(document, newNormalized);
        writeText(projectPath, document.toString());
    }
    removeFolderFromProject(projectPath, folder, removeFileReferences) {
        const normalized = normalizeLogicalFolder(folder);
        if (!normalized) {
            throw new Error('A QPM logical folder name is required.');
        }
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const parentFolder = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
        for (const section of [...document.sections].filter((candidate) => /^File \d{4}$/i.test(candidate.name))) {
            const current = normalizeLogicalFolder((0, pathUtils_1.unquote)(section.get('Folder')) ?? '');
            if (!isSameOrDescendantFolder(current, normalized)) {
                continue;
            }
            if (removeFileReferences) {
                document.removeSection(section.name);
            }
            else {
                const suffix = current.slice(normalized.length).replace(/^\/+/, '');
                section.set('Folder', (0, pathUtils_1.quote)([parentFolder, suffix].filter(Boolean).join('/')));
            }
        }
        this.rewriteDeclaredFolders(document, (declared) => {
            if (!isSameOrDescendantFolder(declared, normalized)) {
                return declared;
            }
            if (removeFileReferences) {
                return undefined;
            }
            const suffix = declared.slice(normalized.length).replace(/^\/+/, '');
            return [parentFolder, suffix].filter(Boolean).join('/') || undefined;
        });
        const header = document.getSection('Project Header');
        if (header) {
            header.set('Number of Files', String(document.sections.filter((section) => /^File \d{4}$/i.test(section.name)).length));
        }
        writeText(projectPath, document.toString());
    }
    setFileExcluded(projectPath, sectionName, excluded) {
        const section = this.requireProjectFileSection(projectPath, sectionName);
        section.section.set('Exclude', excluded ? 'True' : 'False');
        writeText(projectPath, section.document.toString());
    }
    setCompileIntoObjectFile(projectPath, sectionName, enabled) {
        const section = this.requireProjectFileSection(projectPath, sectionName);
        const fileType = (0, pathUtils_1.unquote)(section.section.get('File Type')) ?? 'Other';
        if (fileType !== 'CSource') {
            throw new Error('The .Obj option is available only for C source files.');
        }
        section.section.set('Compile Into Object File', enabled ? 'True' : 'False');
        writeText(projectPath, section.document.toString());
    }
    replaceFileInProject(projectPath, sectionName, replacementPath) {
        const { document, section } = this.requireProjectFileSection(projectPath, sectionName);
        const projectDirectory = path.dirname(projectPath);
        const fileType = fileTypeForPath(replacementPath);
        section.set('File Type', (0, pathUtils_1.quote)(fileType));
        section.set('Path Is Rel', 'True');
        section.set('Path Rel To', (0, pathUtils_1.quote)('Project'));
        section.set('Path Rel Path', (0, pathUtils_1.quote)((0, pathUtils_1.normalizeRelativePath)(projectDirectory, replacementPath)));
        setPossiblyLongValue(section, 'Path', replacementPath);
        if (fileType === 'CSource') {
            if (!section.has('Compile Into Object File')) {
                section.set('Compile Into Object File', 'False');
            }
        }
        else {
            section.delete('Compile Into Object File');
        }
        writeText(projectPath, document.toString());
    }
    moveFilesToFolderInProject(projectPath, sectionNames, folder) {
        const normalizedFolder = normalizeLogicalFolder(folder);
        const sectionNameSet = new Set(sectionNames.map((name) => name.trim()).filter(Boolean));
        if (sectionNameSet.size === 0) {
            return 0;
        }
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        let moved = 0;
        for (const section of document.sections.filter((candidate) => /^File \d{4}$/i.test(candidate.name))) {
            if (!sectionNameSet.has(section.name)) {
                continue;
            }
            const currentFolder = normalizeLogicalFolder((0, pathUtils_1.unquote)(section.get('Folder')) ?? '');
            if (currentFolder.toLowerCase() === normalizedFolder.toLowerCase()) {
                continue;
            }
            section.set('Folder', (0, pathUtils_1.quote)(normalizedFolder));
            moved += 1;
        }
        if (moved > 0 && normalizedFolder) {
            this.ensureProjectFolder(document, normalizedFolder);
        }
        if (moved > 0) {
            writeText(projectPath, document.toString());
        }
        return moved;
    }
    synchronizeWorkspaceBreakpoints(workspacePath, projectIndex, projectPath, requestedBreakpoints, previouslyTrackedBreakpoints = [], preserveNativeBreakpoints = false) {
        if (path.extname(workspacePath).toLowerCase() !== '.cws') {
            throw new Error('Native QPM breakpoint synchronization requires an opened .cws workspace.');
        }
        const document = iniDocument_1.IniDocument.parse(readText(workspacePath));
        const header = document.getSection('Workspace Header');
        if (!header) {
            throw new Error('Invalid Qt workspace: missing [Workspace Header].');
        }
        const projectCount = Number(header.get('Number of Projects') ?? '0');
        if (projectIndex < 1 || projectIndex > projectCount || !header.has(`Project ${workspaceProjectSuffix(projectIndex)}`)) {
            throw new Error(`Refusing to synchronize QPM breakpoints: project ${projectIndex} is not declared in the workspace.`);
        }
        const project = this.parseProject(projectPath);
        const projectFiles = new Map(project.files
            .filter(isBreakpointCompatibleProjectFile)
            .map((file) => [normalizeComparablePath(file.absolutePath), file]));
        const previousByFile = new Map();
        for (const breakpoint of previouslyTrackedBreakpoints) {
            const key = normalizeComparablePath(breakpoint.filePath);
            if (!key || !projectFiles.has(key) || !Number.isInteger(breakpoint.line) || breakpoint.line < 1) {
                continue;
            }
            const lines = previousByFile.get(key) ?? new Set();
            lines.add(breakpoint.line);
            previousByFile.set(key, lines);
        }
        const requestedByFile = new Map();
        const ignoredBreakpoints = [];
        for (const breakpoint of requestedBreakpoints) {
            const key = normalizeComparablePath(breakpoint.filePath);
            if (!key || !projectFiles.has(key) || !Number.isInteger(breakpoint.line) || breakpoint.line < 1) {
                ignoredBreakpoints.push(breakpoint);
                continue;
            }
            const lines = requestedByFile.get(key) ?? new Set();
            lines.add(breakpoint.line);
            requestedByFile.set(key, lines);
        }
        const sectionsByPath = new Map();
        for (const section of document.sections.filter((candidate) => /^File \d{4}$/i.test(candidate.name))) {
            const sectionPath = readWorkspaceFilePath(section);
            if (sectionPath) {
                sectionsByPath.set(normalizeComparablePath(sectionPath), section);
            }
        }
        const changedSections = new Set();
        const createdWorkspaceFileSections = [];
        const trackedBreakpoints = [];
        let appliedCount = 0;
        let preservedNativeCount = 0;
        let removedTrackedCount = 0;
        let removedNativeCount = 0;
        for (const [fileKey, projectFile] of projectFiles) {
            const requestedLines = requestedByFile.get(fileKey) ?? new Set();
            const previousLines = previousByFile.get(fileKey) ?? new Set();
            let section = sectionsByPath.get(fileKey);
            if (!section && requestedLines.size === 0) {
                continue;
            }
            if (!section) {
                const ensured = ensureWorkspaceFileSection(document, header, projectIndex, projectFile);
                section = ensured.section;
                sectionsByPath.set(fileKey, section);
                if (ensured.created) {
                    createdWorkspaceFileSections.push(section.name);
                }
            }
            const existing = readWorkspaceBreakpoints(section);
            const target = new Map();
            if (preserveNativeBreakpoints) {
                for (const [line, value] of existing) {
                    if (!previousLines.has(line)) {
                        target.set(line, value);
                        preservedNativeCount += 1;
                    }
                    else if (!requestedLines.has(line)) {
                        removedTrackedCount += 1;
                    }
                }
            }
            else {
                // Mirror mode is intentionally exact: native breakpoints for files in
                // the active project are replaced by the enabled standard VS Code
                // breakpoints. Tracepoints are stored separately and remain intact.
                for (const line of existing.keys()) {
                    if (!requestedLines.has(line))
                        removedNativeCount += 1;
                }
                for (const line of previousLines) {
                    if (!requestedLines.has(line))
                        removedTrackedCount += 1;
                }
            }
            for (const line of requestedLines) {
                appliedCount += 1;
                target.set(line, (0, pathUtils_1.quote)(`${line},0,enabled,`));
                trackedBreakpoints.push({ filePath: projectFile.absolutePath, line });
            }
            const before = section.lines.join('\n');
            replaceWorkspaceBreakpoints(section, target);
            if (section.lines.join('\n') !== before) {
                changedSections.add(section.name);
            }
        }
        if (createdWorkspaceFileSections.length > 0 || changedSections.size > 0) {
            writeText(workspacePath, document.toString());
        }
        return {
            changed: createdWorkspaceFileSections.length > 0 || changedSections.size > 0,
            requestedCount: requestedBreakpoints.length,
            appliedCount,
            preservedNativeCount,
            removedTrackedCount,
            removedNativeCount,
            createdWorkspaceFileSections,
            ignoredBreakpoints,
            trackedBreakpoints
        };
    }
    createWorkspace(rootDirectory, workspaceName, projectPath, qpmDir, formatVersion) {
        fs.mkdirSync(rootDirectory, { recursive: true });
        const workspacePath = path.join(rootDirectory, `${workspaceName}.cws`);
        if (fs.existsSync(workspacePath)) {
            throw new Error(`The Qt workspace already exists: ${workspacePath}`);
        }
        const projectEntry = (0, pathUtils_1.normalizeRelativePath)(rootDirectory, projectPath);
        writeText(workspacePath, this.createMinimalWorkspaceText(workspacePath, projectEntry, qpmDir, formatVersion));
        return workspacePath;
    }
    createWorkspaceAndProject(rootDirectory, workspaceName, projectName, targetType, qpmDir, formatVersion) {
        fs.mkdirSync(rootDirectory, { recursive: true });
        const projectPath = path.join(rootDirectory, `${projectName}.prj`);
        const workspacePath = path.join(rootDirectory, `${workspaceName}.cws`);
        if (fs.existsSync(projectPath) || fs.existsSync(workspacePath)) {
            throw new Error('The target workspace or project file already exists.');
        }
        writeText(projectPath, this.createMinimalProjectText(projectPath, projectName, targetType, qpmDir, formatVersion));
        writeText(workspacePath, this.createMinimalWorkspaceText(workspacePath, path.basename(projectPath), qpmDir, formatVersion));
        return { workspacePath, projectPath };
    }
    createProject(projectDirectory, projectName, targetType, qpmDir, formatVersion) {
        fs.mkdirSync(projectDirectory, { recursive: true });
        const projectPath = path.join(projectDirectory, `${projectName}.prj`);
        if (fs.existsSync(projectPath)) {
            throw new Error(`The Qt project already exists: ${projectPath}`);
        }
        writeText(projectPath, this.createMinimalProjectText(projectPath, projectName, targetType, qpmDir, formatVersion));
        return projectPath;
    }
    ensureProjectFolder(document, folder) {
        const folders = document.ensureSection('Folders', 'Custom Build Configs');
        const entries = folders.entries().filter(({ key }) => /^Folder \d+$/i.test(key));
        if (entries.some(({ value }) => ((0, pathUtils_1.unquote)(value) ?? '').toLowerCase() === folder.toLowerCase())) {
            return;
        }
        folders.set(`Folder ${entries.length}`, (0, pathUtils_1.quote)(folder));
    }
    requireProjectFileSection(projectPath, sectionName) {
        const document = iniDocument_1.IniDocument.parse(readText(projectPath));
        const section = document.getSection(sectionName);
        if (!section || !/^File \d{4}$/i.test(section.name)) {
            throw new Error(`Qt project file entry not found: ${sectionName}`);
        }
        return { document, section };
    }
    rewriteDeclaredFolders(document, mapFolder) {
        const folders = document.ensureSection('Folders', 'Custom Build Configs');
        const preserved = folders.entries().filter(({ key }) => !/^Folder \d+$/i.test(key));
        const mapped = folders.entries()
            .filter(({ key }) => /^Folder \d+$/i.test(key))
            .map(({ value }) => mapFolder(normalizeLogicalFolder((0, pathUtils_1.unquote)(value) ?? '')))
            .filter((folder) => Boolean(folder))
            .filter((folder, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === folder.toLowerCase()) === index);
        folders.lines = preserved.map(({ key, value }) => `${key} = ${value}`);
        mapped.forEach((folder, index) => folders.set(`Folder ${index}`, (0, pathUtils_1.quote)(folder)));
        folders.lines.push('');
    }
    createMinimalWorkspaceText(workspacePath, projectFileName, qpmDir, version) {
        const document = new iniDocument_1.IniDocument();
        const header = new iniDocument_1.IniSection('Workspace Header', []);
        header.set('Version', String(version));
        setPossiblyLongValue(header, 'Pathname', workspacePath);
        if (qpmDir) {
            setPossiblyLongValue(header, 'QPM Dir', qpmDir);
        }
        header.set('Number of Projects', '1');
        header.set('Active Project', '1');
        header.set('Project 0001', (0, pathUtils_1.quote)(projectFileName));
        header.set('Save Changes Before Running', (0, pathUtils_1.quote)('Always'));
        header.set('Save Changes Before Compiling', (0, pathUtils_1.quote)('Always'));
        header.set('Sort Type', (0, pathUtils_1.quote)('File Name'));
        header.lines.push('');
        document.addSection(header);
        ensureWorkspaceProjectSections(document, 1, version);
        return document.toString();
    }
    createMinimalProjectText(projectPath, projectName, targetType, qpmDir, version) {
        const document = new iniDocument_1.IniDocument();
        const header = new iniDocument_1.IniSection('Project Header', []);
        header.set('Version', String(version));
        setPossiblyLongValue(header, 'Pathname', projectPath);
        if (qpmDir) {
            setPossiblyLongValue(header, 'QPM Dir', qpmDir);
        }
        header.set('Number of Files', '0');
        header.set('Target Type', (0, pathUtils_1.quote)(targetType));
        header.set('Flags', targetType === 'Executable' ? '2064' : '0');
        header.set('Copied From Locked InstrDrv Directory', 'False');
        header.set('Copied from VXIPNP Directory', 'False');
        header.set('Locked InstrDrv Name', (0, pathUtils_1.quote)(''));
        header.set("Don't Display Deploy InstrDrv Dialog", 'False');
        header.lines.push('');
        document.addSection(header);
        const folders = new iniDocument_1.IniSection('Folders', []);
        folders.set('Instrument Files Folder Not Added Yet', 'True');
        folders.set('Library Files Folder Not Added Yet', 'True');
        folders.lines.push('');
        document.addSection(folders);
        const custom = new iniDocument_1.IniSection('Custom Build Configs', []);
        custom.set('Num Custom Build Configs', '0');
        custom.lines.push('');
        document.addSection(custom);
        for (const mode of ['Debug', 'Release', 'Debug64', 'Release64']) {
            const config = new iniDocument_1.IniSection(`Default Build Config ${mode}`, []);
            config.set('Config Name', (0, pathUtils_1.quote)(mode));
            config.set('Is 64-Bit', mode.endsWith('64') ? 'True' : 'False');
            config.set('Is Release', mode.startsWith('Release') ? 'True' : 'False');
            config.set('Default Calling Convention', (0, pathUtils_1.quote)('cdecl'));
            config.set('Require Prototypes', 'True');
            config.set('Require Return Values', 'True');
            config.set('Enable C99 Extensions', 'True');
            config.set('Stack Size', '250000');
            config.set('Runtime Support', (0, pathUtils_1.quote)('Full Runtime Support'));
            config.set('Runtime Binding', (0, pathUtils_1.quote)('Shared'));
            config.lines.push('');
            document.addSection(config);
        }
        const createExecutable = new iniDocument_1.IniSection('Create Executable', []);
        const extension = targetType === 'Dynamic Link Library' ? '.dll' : targetType === 'Static Library' ? '.a' : '.exe';
        for (const mode of ['Debug', 'Release', 'Debug64', 'Release64']) {
            createExecutable.set(`Executable File_${mode} Is Rel`, 'True');
            createExecutable.set(`Executable File_${mode} Rel To`, (0, pathUtils_1.quote)('Project'));
            createExecutable.set(`Executable File_${mode} Rel Path`, (0, pathUtils_1.quote)(`${projectName}${extension}`));
            setPossiblyLongValue(createExecutable, `Executable File_${mode}`, path.join(path.dirname(projectPath), `${projectName}${extension}`));
        }
        createExecutable.set('Runtime Support', (0, pathUtils_1.quote)('Full Runtime Support'));
        createExecutable.lines.push('');
        document.addSection(createExecutable);
        for (const name of ['Compiler Options', 'Run Options', 'Compiler Defines', 'External Compiler Support', 'ActiveX Server Options', 'Signing Info', 'Manifest Info', 'tpcSection']) {
            document.addSection(new iniDocument_1.IniSection(name, ['']));
        }
        return document.toString();
    }
}
exports.QpmParser = QpmParser;
