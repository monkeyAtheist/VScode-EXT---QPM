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
exports.initWebviewKit = initWebviewKit;
exports.createNonce = createNonce;
exports.mediaUri = mediaUri;
exports.cspContent = cspContent;
exports.hardenHtml = hardenHtml;
exports.isAllowedWebviewCommand = isAllowedWebviewCommand;
exports.executeWebviewCommand = executeWebviewCommand;
exports.escapeHtml = escapeHtml;
exports.safeJson = safeJson;
const vscode = __importStar(require("vscode"));
/**
 * Shared helpers for every QPM webview: strict Content-Security-Policy with a per-render nonce,
 * the shared design-system stylesheet and a command allowlist for webview → extension messages.
 *
 * Call {@link initWebviewKit} once from `activate()` so that stylesheet/script URIs can be resolved.
 */
let extensionRoot;
function initWebviewKit(context) {
    extensionRoot = context.extensionUri;
}
function createNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let index = 0; index < 32; index++)
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
}
/** URI of a file under `media/webview/` as seen from the given webview (undefined before initWebviewKit). */
function mediaUri(webview, fileName) {
    return extensionRoot ? webview.asWebviewUri(vscode.Uri.joinPath(extensionRoot, 'media', 'webview', fileName)) : undefined;
}
/**
 * Strict policy: scripts only with the nonce (or from the extension's own media files), no eval, no remote content.
 * Inline styles stay allowed because many generated pages use `style="…"` attributes; style injection cannot run code.
 */
function cspContent(webview, nonce) {
    return [
        "default-src 'none'",
        `img-src ${webview.cspSource} data:`,
        `font-src ${webview.cspSource}`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `script-src 'nonce-${nonce}' ${webview.cspSource}`
    ].join('; ');
}
/**
 * Makes a generated HTML document safe to assign to `webview.html`:
 * removes any existing CSP meta tag, injects the strict nonce-based policy, adds the nonce to every
 * `<script>` tag and links optionally the shared stylesheet (design system).
 */
function hardenHtml(html, webview, options = {}) {
    const nonce = createNonce();
    const csp = `<meta http-equiv="Content-Security-Policy" content="${cspContent(webview, nonce)}">`;
    const style = options.sharedStyles ? mediaUri(webview, 'qpm-webview.css') : undefined;
    const headExtras = csp + (style ? `<link rel="stylesheet" href="${style.toString()}">` : '');
    let out = html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
    // Re-key every script with this render's nonce (pages may carry a nonce of their own from an older template).
    out = out.replace(/(<script\b[^>]*?)\s+nonce=(["'])[^"']*\2/gi, '$1');
    out = out.replace(/<script\b/gi, `<script nonce="${nonce}"`);
    if (/<head[^>]*>/i.test(out)) {
        // Right after <meta charset> when present, otherwise first thing in <head>, so page styles still override.
        if (/<meta\s+charset=[^>]*>/i.test(out))
            out = out.replace(/<meta\s+charset=[^>]*>/i, (match) => match + headExtras);
        else
            out = out.replace(/<head[^>]*>/i, (match) => match + headExtras);
    }
    else {
        out = headExtras + out;
    }
    const harmonize = options.harmonize ? mediaUri(webview, 'qpm-harmonize.css') : undefined;
    if (harmonize) {
        const link = `<link rel="stylesheet" href="${harmonize.toString()}">`;
        out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${link}</head>`) : link + out;
    }
    return out;
}
/** Only QPM's own contributed commands may be triggered from a webview message. */
function isAllowedWebviewCommand(command) {
    return typeof command === 'string' && /^qpm\.[A-Za-z0-9_.-]+$/.test(command);
}
async function executeWebviewCommand(command, ...args) {
    if (!isAllowedWebviewCommand(command)) {
        void vscode.window.showWarningMessage(`QPM blocked a command request from a webview: ${String(command).slice(0, 80)}`);
        return;
    }
    await vscode.commands.executeCommand(command, ...args);
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
/** JSON for embedding inside a <script> block. */
function safeJson(value) {
    return JSON.stringify(value ?? null).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
