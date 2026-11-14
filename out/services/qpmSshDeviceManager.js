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
exports.sshConfigPath = sshConfigPath;
exports.saveSshAlias = saveSshAlias;
exports.deleteSshAlias = deleteSshAlias;
exports.listEditableSshAliases = listEditableSshAliases;
exports.loadSshDeviceManagerData = loadSshDeviceManagerData;
exports.quoteTerminalArg = quoteTerminalArg;
exports.validateSshTerminalTarget = validateSshTerminalTarget;
exports.sendSshTerminalCommand = sendSshTerminalCommand;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
function sshConfigPath() {
    return path.join(os.homedir(), '.ssh', 'config');
}
function ensureUserSshConfigFile() {
    const filePath = sshConfigPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath))
        fs.writeFileSync(filePath, '', 'utf8');
    return filePath;
}
function readTextFileIfPresent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    }
    catch {
        return '';
    }
}
function locateSshHostBlocks(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const starts = [];
    for (let i = 0; i < lines.length; i += 1) {
        const match = lines[i].match(/^\s*Host\s+(.+?)\s*$/i);
        if (match) {
            starts.push({ start: i, patterns: match[1].trim().split(/\s+/).filter(Boolean) });
        }
    }
    return starts.map((entry, blockIndex) => {
        const end = blockIndex + 1 < starts.length ? starts[blockIndex + 1].start : lines.length;
        return { blockIndex, start: entry.start, end, patterns: entry.patterns, lines: lines.slice(entry.start, end) };
    });
}
function parseSshAliasRecords(text) {
    return locateSshHostBlocks(text).map((block) => {
        const values = {};
        for (const line of block.lines.slice(1)) {
            const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s+(.+?)\s*$/);
            if (match && values[match[1].toLowerCase()] === undefined) {
                values[match[1].toLowerCase()] = match[2].trim();
            }
        }
        const editable = block.patterns.length === 1 && !/[!*?]/.test(block.patterns[0]);
        return {
            blockIndex: block.blockIndex,
            host: block.patterns.join(' '),
            hostName: values.hostname || '',
            user: values.user || '',
            port: values.port || '',
            identityFile: values.identityfile || '',
            identitiesOnly: values.identitiesonly || '',
            proxyJump: values.proxyjump || '',
            editable
        };
    });
}
function normalizeSshForm(rawForm) {
    const value = (name) => String(rawForm?.[name] ?? '').trim();
    const host = String(rawForm?.host ?? rawForm?.alias ?? '').trim();
    if (!host || !/^[A-Za-z0-9._-]+$/.test(host)) {
        throw new Error('Host alias must contain only letters, digits, dot, underscore, or dash.');
    }
    const port = value('port');
    if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
        throw new Error('Port must be an integer between 1 and 65535.');
    }
    const rawIdentitiesOnly = rawForm?.identitiesOnly;
    const identitiesOnly = typeof rawIdentitiesOnly === 'boolean' ? (rawIdentitiesOnly ? 'yes' : 'no') : String(rawIdentitiesOnly ?? '').trim();
    if (identitiesOnly && !/^(yes|no)$/i.test(identitiesOnly)) {
        throw new Error('IdentitiesOnly must be yes, no, or empty.');
    }
    return {
        host,
        hostName: value('hostName'),
        user: value('user'),
        port,
        identityFile: value('identityFile'),
        identitiesOnly,
        proxyJump: value('proxyJump')
    };
}
function renderSshAliasBlock(form) {
    const lines = [`Host ${form.host}`];
    const add = (key, value) => { if (value)
        lines.push(`    ${key} ${value}`); };
    add('HostName', form.hostName);
    add('User', form.user);
    add('Port', form.port);
    add('IdentityFile', form.identityFile);
    add('IdentitiesOnly', form.identitiesOnly);
    add('ProxyJump', form.proxyJump);
    return lines;
}
function saveSshAlias(rawForm, requestedBlockIndex) {
    const form = normalizeSshForm(rawForm);
    const filePath = ensureUserSshConfigFile();
    const original = readTextFileIfPresent(filePath).replace(/\r\n/g, '\n');
    const lines = original ? original.split('\n') : [];
    const blocks = locateSshHostBlocks(original);
    const newBlock = renderSshAliasBlock(form);
    let target = Number.isInteger(requestedBlockIndex) && requestedBlockIndex >= 0
        ? blocks.find((block) => block.blockIndex === requestedBlockIndex)
        : undefined;
    if (!target) {
        target = blocks.find((block) => block.patterns.length === 1 && block.patterns[0].toLowerCase() === form.host.toLowerCase());
    }
    if (target) {
        if (target.patterns.length !== 1 || /[!*?]/.test(target.patterns[0])) {
            throw new Error('Wildcard or multi-host blocks are read-only in the visual manager. Edit ~/.ssh/config directly for this block.');
        }
        lines.splice(target.start, target.end - target.start, ...newBlock);
    }
    else {
        const wildcard = blocks.find((block) => block.patterns.some((pattern) => /[!*?]/.test(pattern)));
        const insertAt = wildcard ? wildcard.start : lines.length;
        const prefix = insertAt > 0 && lines[insertAt - 1]?.trim() ? [''] : [];
        const suffix = insertAt < lines.length && lines[insertAt]?.trim() ? [''] : [];
        lines.splice(insertAt, 0, ...prefix, ...newBlock, ...suffix);
    }
    const output = lines.join(os.EOL).replace(/(?:\r?\n)*$/, os.EOL);
    fs.writeFileSync(filePath, output, 'utf8');
}
function deleteSshAlias(blockIndex) {
    const filePath = sshConfigPath();
    const original = readTextFileIfPresent(filePath).replace(/\r\n/g, '\n');
    const lines = original.split('\n');
    const block = locateSshHostBlocks(original).find((entry) => entry.blockIndex === blockIndex);
    if (!block)
        throw new Error('SSH alias block not found.');
    if (block.patterns.length !== 1 || /[!*?]/.test(block.patterns[0])) {
        throw new Error('Wildcard or multi-host blocks are read-only in the visual manager.');
    }
    lines.splice(block.start, block.end - block.start);
    while (lines.length && !lines[0].trim())
        lines.shift();
    const output = lines.join(os.EOL).replace(/(?:\r?\n)*$/, os.EOL);
    fs.writeFileSync(filePath, output, 'utf8');
}
function execFileCapture(file, args) {
    const childProcess = require('child_process');
    return new Promise((resolve) => {
        childProcess.execFile(file, args, { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (_error, stdout) => {
            resolve(String(stdout || ''));
        });
    });
}
async function scanLocalSshNeighbors() {
    const results = [];
    const seen = new Set();
    const add = (entry) => {
        if (!entry.address || seen.has(entry.address))
            return;
        seen.add(entry.address);
        results.push(entry);
    };
    if (process.platform === 'win32') {
        const output = await execFileCapture('arp.exe', ['-a']);
        for (const line of output.split(/\r?\n/)) {
            const match = line.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f-]{11,17})\s+/i);
            if (match)
                add({ address: match[1], mac: match[2], source: 'arp -a' });
        }
    }
    else {
        let output = await execFileCapture('ip', ['neigh', 'show']);
        if (!output.trim())
            output = await execFileCapture('arp', ['-an']);
        for (const line of output.split(/\r?\n/)) {
            let match = line.match(/^([^\s]+)\s+.*?lladdr\s+([0-9a-f:]{11,17})/i);
            if (match) {
                add({ address: match[1], mac: match[2], source: 'ip neigh' });
                continue;
            }
            match = line.match(/\(([^)]+)\)\s+at\s+([0-9a-f:]{11,17})/i);
            if (match)
                add({ address: match[1], mac: match[2], source: 'arp -an' });
        }
    }
    return results;
}
function readLocalHostsRecords() {
    const hostsPath = process.platform === 'win32'
        ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
        : '/etc/hosts';
    const text = readTextFileIfPresent(hostsPath);
    const out = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*/, '').trim();
        if (!line)
            continue;
        const parts = line.split(/\s+/);
        const address = parts.shift() || '';
        for (const name of parts) {
            if (name && name.toLowerCase() !== 'localhost')
                out.push({ address, name, source: 'hosts' });
        }
    }
    return out;
}
function listEditableSshAliases() {
    return parseSshAliasRecords(readTextFileIfPresent(sshConfigPath())).filter((entry) => entry.editable);
}
async function loadSshDeviceManagerData() {
    const configPath = sshConfigPath();
    const [neighbors] = await Promise.all([scanLocalSshNeighbors()]);
    return {
        configPath,
        aliases: parseSshAliasRecords(readTextFileIfPresent(configPath)),
        hosts: readLocalHostsRecords(),
        neighbors
    };
}
function quoteTerminalArg(value) {
    return `"${String(value).replace(/"/g, '\\"')}"`;
}
function validateSshTerminalTarget(target) {
    const value = String(target || '').trim();
    if (!value || !/^[A-Za-z0-9._:@%+\-\[\]]+$/.test(value)) {
        throw new Error('Unsafe or invalid SSH target.');
    }
    return value;
}
function sendSshTerminalCommand(command) {
    let terminal = vscode.window.terminals.find((entry) => entry.name === 'QPM SSH');
    if (!terminal)
        terminal = vscode.window.createTerminal({ name: 'QPM SSH' });
    terminal.show(true);
    terminal.sendText(command, true);
}
