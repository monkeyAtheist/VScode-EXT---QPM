'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.33.0');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-qrc-031-'));
const qrcPath = path.join(temp, 'resources.qrc');
fs.writeFileSync(qrcPath, '<RCC>\r\n    <qresource prefix="/"/>\r\n</RCC>\r\n', 'utf8');

const originalLoad = Module._load;
let capturedPanel;
class ThemeIcon { constructor(id) { this.id = id; } }
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      ThemeIcon,
      ViewColumn: { Active: 1 },
      Uri: { file: (fsPath) => ({ fsPath }) },
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
      window: {
        createWebviewPanel: () => {
          const webview = {
            cspSource: 'vscode-webview:',
            html: '',
            onDidReceiveMessage: () => ({ dispose() {} })
          };
          capturedPanel = {
            webview,
            iconPath: undefined,
            onDidDispose: () => ({ dispose() {} }),
            reveal() {},
            dispose() {}
          };
          return capturedPanel;
        },
        showTextDocument: async () => undefined,
        showErrorMessage: () => undefined,
        showWarningMessage: async () => undefined,
        showOpenDialog: async () => undefined
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const resource = require('../out/views/qtResourceEditorPanel');
  const parsed = resource.readQtResourceDocument(qrcPath);
  assert.strictEqual(parsed.groups.length, 1, 'self-closing qresource must be preserved');
  assert.strictEqual(parsed.groups[0].prefix, '/');
  assert.deepStrictEqual(parsed.groups[0].files, []);

  const panel = new resource.QtResourceEditorPanel(qrcPath, { appendLine() {} }, () => undefined);
  assert(panel);
  assert(capturedPanel && capturedPanel.webview.html, 'editor webview HTML must be generated');
  const html = capturedPanel.webview.html;
  assert(html.includes('id="addFilesTop"'), 'top-level Add files action must be rendered');
  assert(html.includes('No file in this prefix. Use “Add files”.'), 'empty prefix guidance must be rendered');
  assert(html.includes('String.fromCharCode(92)'), 'Windows slash conversion must not inject an invalid regex');

  const scriptMatch = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/i);
  assert(scriptMatch, 'webview client script must be present');
  assert.doesNotThrow(() => new Function(scriptMatch[1]), 'webview client script must be syntactically valid');
  panel.dispose();
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log('QPM 0.3.1 Qt Resource Editor tests: PASS');
