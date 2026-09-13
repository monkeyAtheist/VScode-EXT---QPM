'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.33.0');

const expectedPages = ['overview','project','build','run','debug','qt','platforms','quality','dependencies','distribution'];
for (const id of expectedPages) assert(source.includes(`{ id: '${id}'`), `missing settings page ${id}`);
assert(source.includes('data-settings-page-target='), 'page navigation buttons missing');
assert(source.includes('const refreshSectionNavigation = () =>'), 'page-local section navigation missing');
assert(source.includes('const activatePage = (pageId, scrollToTop = false) =>'), 'page activation missing');
assert(source.includes("vscode.setState({ ...webviewState, activePage })"), 'active page persistence missing');
assert(source.includes('Filter settings on this page…'), 'page-local filter label missing');
assert(!source.includes('<option value="section-control">Control center</option>'), 'legacy global section list must be removed');

const sections = [...source.matchAll(/<section id="([^"]+)" data-settings-section data-settings-page="([^"]+)" data-settings-title="([^"]+)"/g)];
assert.strictEqual(sections.length, 22, `expected 22 settings sections, got ${sections.length}`);
for (const [, sectionId, page] of sections) assert(expectedPages.includes(page), `${sectionId} uses unknown page ${page}`);

assert(source.includes("'Debug'} compiler & linker settings"), 'debug compiler/linker title missing');
assert(source.includes('<h3>Linkage</h3>'), 'linkage subsection missing');
assert(source.includes('<h3>Preprocessor</h3>'), 'preprocessor subsection missing');
assert(source.includes('<h3>Compiler</h3>'), 'compiler subsection missing');
assert(source.includes('<h3>Linker</h3>'), 'linker subsection missing');
assert(!source.includes("'Debug flags'"), 'ambiguous Debug flags title still present');

const commandIds = new Set((pkg.contributes.commands || []).map((entry) => entry.command));
const uiCommands = [...source.matchAll(/data-command="([^"]+)"/g)].map((match) => match[1]);
for (const id of uiCommands) assert(commandIds.has(id), `settings command is not contributed: ${id}`);

const controlIds = [];
for (const helper of ['field','area','selectField','readOnlyField','numberField']) {
  const regex = new RegExp(`${helper}\\(\\s*'[^']*'\\s*,\\s*'([^']+)'`, 'g');
  for (const match of source.matchAll(regex)) controlIds.push(match[1]);
}
for (const match of source.matchAll(/check\(\s*'([^']+)'/g)) controlIds.push(match[1]);
for (const match of source.matchAll(/<(?:input|select|textarea)[^>]*id="([A-Za-z0-9_-]+)"/g)) controlIds.push(match[1]);
const counts = new Map();
for (const id of controlIds) counts.set(id, (counts.get(id) || 0) + 1);
const duplicateControls = [...counts.entries()].filter(([, count]) => count > 1);
assert.deepStrictEqual(duplicateControls, [], `duplicate settings control IDs: ${JSON.stringify(duplicateControls)}`);

const explicitButtonIds = new Set([...source.matchAll(/<button[^>]*id="([A-Za-z0-9_-]+)"/g)].map((match) => match[1]));
const handledIds = new Set([...source.matchAll(/on\('([^']+)'/g)].map((match) => match[1]));
for (const match of source.matchAll(/\[([^\]]+)\]\.forEach\(\(id\) => on\(id/g)) {
  for (const quoted of match[1].matchAll(/'([^']+)'/g)) handledIds.add(quoted[1]);
}
for (const id of explicitButtonIds) assert(handledIds.has(id), `button ${id} has no explicit handler`);

function objectKeys(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `cannot locate ${startMarker}`);
  return new Set([...source.slice(start, end).matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map((match) => match[1]));
}
const controls = new Set(controlIds);
for (const id of objectKeys('const PATH_BROWSE_FIELDS', 'const FIELD_DATALISTS')) assert(controls.has(id), `browse metadata targets missing field ${id}`);
for (const id of objectKeys('const FIELD_DATALISTS', 'const FIELD_HELP')) assert(controls.has(id), `datalist metadata targets missing field ${id}`);

// Render a real default manifest and validate the JavaScript emitted inside the webview.
const os = require('os');
const Module = require('module');
class EventEmitter { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} }
class TreeItem {}
class ThemeIcon { constructor(id) { this.id = id; } }
const vscodeMock = new Proxy({
  EventEmitter, TreeItem, ThemeIcon,
  Uri: { file: (fsPath) => ({ fsPath }), joinPath: (...parts) => ({ fsPath: path.join(...parts.map((part) => part.fsPath || String(part))) }) },
  window: {}, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
}, { get(target, property) { if (property in target) return target[property]; return new Proxy(function () {}, { get: () => function () {}, apply: () => undefined, construct: () => ({}) }); } });
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) { if (request === 'vscode') return vscodeMock; return originalLoad.call(this, request, parent, isMain); };
let renderedHtml = '';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-settings-0330-'));
try {
  const manifestApi = require(path.join(root, 'out', 'model', 'qtProjectManifest.js'));
  const panelApi = require(path.join(root, 'out', 'views', 'qtProjectSettingsPanel.js'));
  const manifestPath = path.join(temp, 'SettingsAudit.qtproject.json');
  manifestApi.writeQtProjectManifest(manifestPath, manifestApi.createDefaultQtProjectManifest('SettingsAudit', 'widgets-application', ['Core', 'Gui', 'Widgets']));
  const panel = new panelApi.QtProjectSettingsPanel(
    {},
    { getActive: () => undefined },
    { getSettings: () => ({ run: { arguments: '', workingDirectory: '', environmentOptions: '', externalProcessPath: '' }, preBuildActions: [], customBuildActions: [], postBuildActions: [] }) },
    { buildMode: 'debug64' }
  );
  renderedHtml = panel.render({ name: 'SettingsAudit', exists: true, absolutePath: manifestPath, index: 0 });
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}
assert(renderedHtml.includes('data-settings-page-target="build"'), 'rendered Build page tab missing');
assert(renderedHtml.includes('Debug compiler &amp; linker settings'), 'rendered compiler/linker section title missing');
const scriptMatch = renderedHtml.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
assert(scriptMatch, 'rendered settings script missing');
assert.doesNotThrow(() => new Function(scriptMatch[1]), 'rendered settings webview script must be syntactically valid');

console.log('QPM 0.33.0 thematic settings pages and settings audit: PASS');
