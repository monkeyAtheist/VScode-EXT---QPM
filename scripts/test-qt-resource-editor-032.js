'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.34.2');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-qrc-032-'));
const projectRoot = path.join(temp, 'QtWidgetsApp');
const resourcesDirectory = path.join(projectRoot, 'resources');
const qrcPath = path.join(resourcesDirectory, 'resources.qrc');
const imagePath = path.join(temp, 'test.png');
fs.mkdirSync(resourcesDirectory, { recursive: true });
fs.writeFileSync(qrcPath, '<RCC>\r\n    <qresource prefix="/"/>\r\n</RCC>\r\n', 'utf8');
fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

const originalLoad = Module._load;
let capturedPanel;
let messageHandler;
const executedCommands = [];
let textDocumentOpenCount = 0;
class ThemeIcon { constructor(id) { this.id = id; } }
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      ThemeIcon,
      ViewColumn: { Active: 1 },
      Uri: { file: (fsPath) => ({ fsPath }) },
      commands: {
        executeCommand: async (...args) => {
          executedCommands.push(args);
          return undefined;
        }
      },
      env: { openExternal: async () => true },
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
      window: {
        createWebviewPanel: () => {
          const webview = {
            cspSource: 'vscode-webview:',
            html: '',
            onDidReceiveMessage: (handler) => {
              messageHandler = handler;
              return { dispose() {} };
            }
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
        showTextDocument: async () => { textDocumentOpenCount += 1; },
        showErrorMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showOpenDialog: async () => undefined
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
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

    assert.strictEqual(typeof messageHandler, 'function', 'webview message handler must be registered');
    await messageHandler({ type: 'openFile', source: '../../test.png', document: parsed });
    const openCall = executedCommands.find((entry) => entry[0] === 'vscode.open');
    assert(openCall, 'binary resources must be opened through vscode.open');
    assert.strictEqual(path.normalize(openCall[1].fsPath), path.normalize(imagePath), 'relative QRC path must resolve from the QRC directory');
    assert.deepStrictEqual(openCall[2], { preview: true });
    assert.strictEqual(textDocumentOpenCount, 0, 'binary resources must not be forced through showTextDocument');

    panel.dispose();
  } finally {
    Module._load = originalLoad;
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log('QPM 0.3.2 Qt Resource Editor open-resource tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
