const assert = require('assert');
const fs = require('fs');
const path = require('path');
process.env.NODE_PATH = path.join(__dirname, '..', 'test-mocks');
require('module').Module._initPaths();

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const templates = require(path.join(root, 'out', 'services', 'qpmTemplateService.js'));
assert.strictEqual(pkg.version, '0.15.2');

const viewToolbar = pkg.contributes.menus['view/title'];
const toolbarModes = ['D32', 'R32', 'D64', 'R64'].map((suffix) => `qpm.toolbarBuildMode${suffix}`);
for (const command of toolbarModes) {
  const item = viewToolbar.find((entry) => entry.command === command);
  assert(item, `Missing toolbar command ${command}`);
  assert(item.when.includes('qpm.buildMode =='));
  assert(pkg.contributes.menus.commandPalette.some((entry) => entry.command === command && entry.when === 'false'));
}
for (const oldCommand of ['qpm.selectBuildModeD32', 'qpm.selectBuildModeR32', 'qpm.selectBuildModeD64', 'qpm.selectBuildModeR64']) {
  assert(!viewToolbar.some((entry) => entry.command === oldCommand && entry.when.includes('qpm.workspaceExplorer')),
    `${oldCommand} must not be used directly by the workspace toolbar`);
}

const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
for (const command of toolbarModes) {
  assert(extension.includes(`register('${command}', () => builds.selectBuildMode())`), `${command} must open the selector`);
}
for (const category of ['C', 'Cpp', 'Qt', 'Windows', 'Documentation', 'User']) {
  assert(extension.includes(`register('qpm.insertSnippet${category}'`));
}

const snippetMenu = pkg.contributes.menus['qpm.editorSnippets'];
for (const submenu of ['qpm.snippetsQt', 'qpm.snippetsC', 'qpm.snippetsCpp', 'qpm.snippetsWindows', 'qpm.snippetsDocumentation', 'qpm.snippetsUser']) {
  assert(snippetMenu.some((entry) => entry.submenu === submenu), `Missing ${submenu}`);
  assert(pkg.contributes.submenus.some((entry) => entry.id === submenu), `Missing submenu declaration ${submenu}`);
}

const snippets = templates.getBuiltInSnippets();
assert(snippets.length >= 35, `Expected an expanded snippet library, got ${snippets.length}`);
const categories = new Set(['qt', 'c', 'cpp', 'windows', 'documentation']);
for (const snippet of snippets) {
  assert(snippet.id && snippet.label && snippet.description && snippet.body);
  assert(Array.isArray(snippet.categories) && snippet.categories.length > 0, `${snippet.id} has no category`);
  for (const category of snippet.categories) assert(categories.has(category), `${snippet.id}: invalid category ${category}`);
}
const qtSnippets = snippets.filter((snippet) => snippet.categories.includes('qt'));
assert(qtSnippets.length >= 12, `Expected at least 12 Qt snippets, got ${qtSnippets.length}`);
for (const id of ['qt-widgets-main', 'qt-connect-signal-slot', 'qt-connect-lambda', 'qt-qobject-class', 'qt-qproperty', 'qt-qtimer', 'qt-qsettings', 'qt-resource-pixmap', 'qt-test-slot']) {
  assert(qtSnippets.some((snippet) => snippet.id === id), `Missing Qt snippet ${id}`);
}
assert(templates.SNIPPET_CATEGORIES.some((entry) => entry.id === 'all'));
assert(templates.SNIPPET_CATEGORIES.some((entry) => entry.id === 'user'));

console.log('QPM 0.7.3 build-mode toolbar and categorized snippet tests: PASS');
