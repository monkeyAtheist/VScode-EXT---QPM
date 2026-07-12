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
exports.POSIX_GNU_RESPONSE_FILE_THRESHOLD = exports.WINDOWS_GNU_RESPONSE_FILE_THRESHOLD = void 0;
exports.estimateGnuArgumentLength = estimateGnuArgumentLength;
exports.shouldUseGnuResponseFile = shouldUseGnuResponseFile;
exports.normalizeGnuResponseArgument = normalizeGnuResponseArgument;
exports.quoteGnuResponseArgument = quoteGnuResponseArgument;
exports.createGnuResponseFileArguments = createGnuResponseFileArguments;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Keep a safety margin below the Windows CreateProcess command-line limit.
 * QPM only enables GNU response files when the direct linker command actually
 * approaches the platform limit; small projects stay on ordinary arguments.
 */
exports.WINDOWS_GNU_RESPONSE_FILE_THRESHOLD = 24_000;
exports.POSIX_GNU_RESPONSE_FILE_THRESHOLD = 100_000;
function estimateGnuArgumentLength(argumentsList) {
    return argumentsList.reduce((total, value) => total + quoteGnuResponseArgument(value).length + 1, 0);
}
function shouldUseGnuResponseFile(argumentsList, platform = process.platform) {
    const threshold = platform === 'win32'
        ? exports.WINDOWS_GNU_RESPONSE_FILE_THRESHOLD
        : exports.POSIX_GNU_RESPONSE_FILE_THRESHOLD;
    return estimateGnuArgumentLength(argumentsList) >= threshold;
}
/**
 * GCC/MinGW response-file parsing treats backslashes as escape characters even
 * when they occur inside a quoted token. Convert drive-qualified and UNC paths
 * to the forward-slash form accepted by GNU tools before serializing them.
 *
 * This also covers embedded paths such as:
 *   -Wl,--out-implib,C:\\build\\library.dll.a
 */
function normalizeGnuResponseArgument(value) {
    const containsWindowsPath = /[A-Za-z]:[\\/]/.test(value) || /(?:^|[=,:])\\\\/.test(value);
    return containsWindowsPath ? value.replace(/\\/g, '/') : value;
}
function quoteGnuResponseArgument(value) {
    const normalized = normalizeGnuResponseArgument(value);
    if (normalized.length === 0)
        return '""';
    if (!/[\s"\\]/.test(normalized))
        return normalized;
    // GNU response files use backslash escaping rather than cmd.exe quoting.
    // Double remaining literal backslashes and escape embedded quotation marks.
    const escaped = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}
function createGnuResponseFileArguments(argumentsList, responseFilePath) {
    fs.mkdirSync(path.dirname(responseFilePath), { recursive: true });
    const content = argumentsList.map(quoteGnuResponseArgument).join('\n');
    fs.writeFileSync(responseFilePath, `${content}\n`, 'utf8');
    return [`@${responseFilePath}`];
}
