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
exports.QpmDeviceRegistry = void 0;
exports.pickOrCreateDevice = pickOrCreateDevice;
exports.endpointSummary = endpointSummary;
exports.endpointKindLabel = endpointKindLabel;
const vscode = __importStar(require("vscode"));
const STATE_KEY = 'qpm.deviceRegistry.v1';
const MAX_DEVICES = 128;
class QpmDeviceRegistry {
    context;
    devices;
    changeEmitter = new vscode.EventEmitter();
    onDidChange = this.changeEmitter.event;
    constructor(context) {
        this.context = context;
        this.devices = normalizeDevices(context.globalState.get(STATE_KEY));
    }
    dispose() {
        this.changeEmitter.dispose();
    }
    list() {
        return this.devices.map(cloneDevice);
    }
    get(id) {
        const device = this.devices.find((item) => item.id === id);
        return device ? cloneDevice(device) : undefined;
    }
    async create(name, description = '', tags = []) {
        const trimmed = name.trim();
        if (!trimmed)
            throw new Error('Device name is required.');
        const now = Date.now();
        const device = {
            id: createId(),
            name: trimmed,
            description: description.trim(),
            tags: normalizeTags(tags),
            endpoints: {},
            createdAt: now,
            updatedAt: now
        };
        this.devices.unshift(device);
        this.devices = this.devices.slice(0, MAX_DEVICES);
        await this.persist();
        return cloneDevice(device);
    }
    async updateMetadata(id, values) {
        const device = this.requireMutable(id);
        if (values.name !== undefined) {
            const name = values.name.trim();
            if (!name)
                throw new Error('Device name is required.');
            device.name = name;
        }
        if (values.description !== undefined)
            device.description = values.description.trim();
        if (values.tags !== undefined)
            device.tags = normalizeTags(values.tags);
        device.updatedAt = Date.now();
        await this.persist();
        return cloneDevice(device);
    }
    async upsertEndpoint(id, endpoint) {
        const device = this.requireMutable(id);
        device.endpoints[endpoint.kind] = cloneEndpoint(endpoint);
        device.updatedAt = Date.now();
        await this.persist();
        return cloneDevice(device);
    }
    async removeEndpoint(id, kind) {
        const device = this.requireMutable(id);
        delete device.endpoints[kind];
        device.updatedAt = Date.now();
        await this.persist();
        return cloneDevice(device);
    }
    async delete(id) {
        const before = this.devices.length;
        this.devices = this.devices.filter((item) => item.id !== id);
        if (this.devices.length === before)
            return false;
        await this.persist();
        return true;
    }
    async replaceAll(devices) {
        this.devices = normalizeDevices(devices).slice(0, MAX_DEVICES);
        await this.persist();
    }
    async merge(devices) {
        const incoming = normalizeDevices(devices);
        const byId = new Map(this.devices.map((item) => [item.id, item]));
        for (const candidate of incoming) {
            const existing = byId.get(candidate.id);
            if (!existing) {
                this.devices.push(candidate);
                byId.set(candidate.id, candidate);
                continue;
            }
            if (candidate.updatedAt >= existing.updatedAt)
                Object.assign(existing, candidate);
        }
        this.devices.sort((a, b) => b.updatedAt - a.updatedAt);
        this.devices = this.devices.slice(0, MAX_DEVICES);
        await this.persist();
    }
    requireMutable(id) {
        const device = this.devices.find((item) => item.id === id);
        if (!device)
            throw new Error('The selected device no longer exists.');
        return device;
    }
    async persist() {
        await this.context.globalState.update(STATE_KEY, this.devices);
        this.changeEmitter.fire(this.list());
    }
}
exports.QpmDeviceRegistry = QpmDeviceRegistry;
async function pickOrCreateDevice(registry, title, suggestedName = '') {
    const devices = registry.list();
    const CREATE = '__create__';
    const selected = await vscode.window.showQuickPick([
        { label: '$(add) Create new device…', description: suggestedName || 'Create a new unified QPM device', id: CREATE },
        ...devices.map((device) => ({
            label: `$(device-desktop) ${device.name}`,
            description: endpointSummary(device),
            detail: device.description || (device.tags.length ? device.tags.join(', ') : undefined),
            id: device.id
        }))
    ], { title, placeHolder: 'Choose a unified device profile' });
    if (!selected)
        return undefined;
    if (selected.id !== CREATE)
        return registry.get(selected.id);
    const name = await vscode.window.showInputBox({ title: 'New QPM device', prompt: 'Device name', value: suggestedName, validateInput: (value) => value.trim() ? undefined : 'A name is required.' });
    if (!name)
        return undefined;
    return registry.create(name);
}
function endpointSummary(device) {
    const kinds = Object.keys(device.endpoints).filter((kind) => !!device.endpoints[kind]);
    return kinds.length ? kinds.map(endpointKindLabel).join(' · ') : 'No communication endpoint yet';
}
function endpointKindLabel(kind) {
    switch (kind) {
        case 'serial': return 'COM';
        case 'visa': return 'VISA';
        case 'tcp': return 'TCP';
        case 'udp': return 'UDP';
        case 'ssh': return 'SSH';
    }
}
function normalizeDevices(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object')
            continue;
        const value = item;
        const name = String(value.name ?? '').trim();
        if (!name)
            continue;
        const now = Date.now();
        const endpoints = {};
        for (const kind of ['serial', 'visa', 'tcp', 'udp', 'ssh']) {
            const endpoint = normalizeEndpoint(kind, value.endpoints?.[kind]);
            if (endpoint)
                endpoints[kind] = endpoint;
        }
        out.push({
            id: String(value.id ?? createId()),
            name,
            description: String(value.description ?? '').trim(),
            tags: normalizeTags(Array.isArray(value.tags) ? value.tags : []),
            endpoints,
            createdAt: finiteTimestamp(value.createdAt, now),
            updatedAt: finiteTimestamp(value.updatedAt, now)
        });
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out.slice(0, MAX_DEVICES);
}
function normalizeEndpoint(kind, raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    if (kind === 'serial' && raw.settings)
        return { kind, settings: { ...raw.settings } };
    if (kind === 'visa' && raw.settings)
        return { kind, settings: { ...raw.settings } };
    if (kind === 'tcp' && raw.settings)
        return { kind, settings: { ...raw.settings } };
    if (kind === 'udp' && raw.settings)
        return { kind, settings: { ...raw.settings } };
    if (kind === 'ssh') {
        const alias = String(raw.alias ?? '').trim();
        const hostName = String(raw.hostName ?? alias).trim();
        if (!alias && !hostName)
            return undefined;
        return {
            kind,
            alias: alias || hostName,
            hostName: hostName || alias,
            user: String(raw.user ?? '').trim() || undefined,
            port: clampPort(raw.port, 22),
            identityFile: String(raw.identityFile ?? '').trim() || undefined,
            proxyJump: String(raw.proxyJump ?? '').trim() || undefined
        };
    }
    return undefined;
}
function cloneDevice(device) {
    const endpoints = {};
    for (const [kind, endpoint] of Object.entries(device.endpoints)) {
        if (endpoint)
            endpoints[kind] = cloneEndpoint(endpoint);
    }
    return { ...device, tags: [...device.tags], endpoints };
}
function cloneEndpoint(endpoint) {
    if (endpoint.kind === 'ssh')
        return { ...endpoint };
    return { kind: endpoint.kind, settings: { ...endpoint.settings } };
}
function normalizeTags(tags) {
    const seen = new Set();
    const out = [];
    for (const raw of tags) {
        const tag = String(raw ?? '').trim();
        if (!tag)
            continue;
        const key = tag.toLocaleLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(tag);
        if (out.length >= 16)
            break;
    }
    return out;
}
function finiteTimestamp(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}
function clampPort(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.min(65535, Math.round(number))) : fallback;
}
function createId() {
    return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
