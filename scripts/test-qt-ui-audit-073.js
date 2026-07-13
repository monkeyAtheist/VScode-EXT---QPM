'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const settingsSource = fs.readFileSync(path.join(root, 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');

assert.strictEqual(pkg.version, '0.15.2');

const commands = pkg.contributes.commands || [];
const commandIds = commands.map((entry) => entry.command);
assert.strictEqual(new Set(commandIds).size, commandIds.length, 'duplicate command contribution');

const menus = pkg.contributes.menus || {};
const editorContext = menus['editor/context'] || [];
const explorerContext = menus['explorer/context'] || [];
assert.strictEqual(editorContext.length, 1, 'editor context must expose one QPM root only');
assert.strictEqual(editorContext[0].submenu, 'qpm.editorRoot');
assert.strictEqual(explorerContext.length, 1, 'explorer context must expose one QPM root only');
assert.strictEqual(explorerContext[0].submenu, 'qpm.explorerRoot');
assert.ok(!editorContext.some((entry) => entry.command && entry.command.startsWith('qpm.')), 'no direct QPM editor command should remain');
assert.ok(!explorerContext.some((entry) => entry.command && entry.command.startsWith('qpm.')), 'no direct QPM explorer command should remain');

const submenuIds = new Set((pkg.contributes.submenus || []).map((entry) => entry.id));
for (const id of [
  'qpm.editorRoot',
  'qpm.editorProject',
  'qpm.editorBuildDebug',
  'qpm.editorTestsQuality',
  'qpm.editorQtTools',
  'qpm.editorSnippets',
  'qpm.explorerRoot'
]) assert.ok(submenuIds.has(id), `missing submenu ${id}`);

const rootSubmenus = new Set((menus['qpm.editorRoot'] || []).map((entry) => entry.submenu));
for (const id of [
  'qpm.editorProject',
  'qpm.editorBuildDebug',
  'qpm.editorQtTools',
  'qpm.editorTestsQuality',
  'qpm.editorDocumentation',
  'qpm.editorSnippets',
  'qpm.editorUtilities'
]) assert.ok(rootSubmenus.has(id), `missing editor root subgroup ${id}`);

const menuCommands = [];
for (const entries of Object.values(menus)) {
  if (!Array.isArray(entries)) continue;
  for (const entry of entries) if (entry.command && entry.command.startsWith('qpm.')) menuCommands.push(entry.command);
}
for (const id of menuCommands) assert.ok(commandIds.includes(id), `menu command is not contributed: ${id}`);

const requiredSettingsTokens = [
  'const FIELD_HELP',
  'const SECTION_HELP',
  'const PATH_BROWSE_FIELDS',
  'const FIELD_DATALISTS',
  'data-help=',
  '.help:hover::after',
  '.help:focus::after',
  'settingsFilter',
  'sectionNav',
  'dirtyState',
  'data-platform-types',
  'data-debug-requests',
  'data-build-systems',
  "message?.type === 'browsePath'",
  "type: 'pathSelected'",
  'Project control center',
  'Tests and quality',
  'Platforms',
  'Advanced debugging'
];
for (const token of requiredSettingsTokens) assert.ok(settingsSource.includes(token), `missing settings UX token: ${token}`);

const helpEntries = (settingsSource.match(/^\s{2}[A-Za-z0-9_]+:\s*'/gm) || []).length;
assert.ok(helpEntries >= 90, `expected at least 90 field help entries, found ${helpEntries}`);
assert.ok(settingsSource.includes("clangTidyChecks: ["), 'clang-tidy presets missing');
assert.ok(settingsSource.includes("debugQmlServices: ["), 'QML debug service presets missing');
assert.ok(settingsSource.includes('Fields that do not apply to the selected backend are hidden automatically.'), 'backend contextual UI missing');

console.log('QPM 0.7.3 context-menu consolidation and settings UX audit tests: PASS');
