'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));

assert.strictEqual(pkg.version, '0.30.0');

const tree = read('src/providers/qpmTreeProvider.ts');
assert(tree.includes("label: 'Generated Files'"), 'workspace tree must expose a Generated Files group');
assert(tree.includes('qtGeneratedDirectory(ref.absolutePath, mode, manifest)'), 'generated group must use the active Qt build profile directory');
assert(tree.includes("kind: 'generatedFile'"), 'generated artifacts must use a dedicated read-only tree node');
assert(tree.includes("name.startsWith('moc_')"), 'MOC artifacts must be recognized');
assert(tree.includes("name.startsWith('ui_')"), 'UIC artifacts must be recognized');
assert(tree.includes("name.startsWith('qrc_')"), 'RCC artifacts must be recognized');
assert(tree.includes("event.affectsConfiguration('qpm.buildMode')"), 'tree must refresh when the Qt build mode changes');
assert(tree.includes('MOC/UIC/RCC artifacts are regenerated during builds'), 'generated nodes must explain that generated artifacts are not source-of-truth files');

const extension = read('src/extension.ts');
assert(extension.includes("register('qpm.openGeneratedFile'"), 'generated files must be openable');
assert(extension.includes("register('qpm.revealGeneratedPath'"), 'generated files/folders must be revealable');
assert(extension.includes("register('qpm.copyGeneratedPath'"), 'generated paths must be copyable');
assert(extension.includes('treeProvider.refresh(); return result;'), 'project build/clean commands must refresh the generated-file tree');
for (const command of ['qpm.build', 'qpm.rebuild', 'qpm.clean', 'qpm.chooseBuildAction']) {
  assert(extension.includes(`register('${command}', async`), `${command} must refresh the generated-file tree after toolbar/quick-action builds`);
}

const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const command of ['qpm.openGeneratedFile', 'qpm.revealGeneratedPath', 'qpm.copyGeneratedPath']) {
  assert(commands.has(command), `${command} must be contributed`);
}

const context = pkg.contributes.menus['view/item/context'];
assert(context.some((entry) => entry.command === 'qpm.openGeneratedFile' && entry.when.includes('qpmGeneratedFile')), 'generated file context menu must provide Open');
assert(context.some((entry) => entry.command === 'qpm.revealGeneratedPath' && entry.when.includes('qpmGeneratedFolder')), 'generated folder context menu must provide Reveal');
assert(!context.some((entry) => ['qpm.removeFile', 'qpm.renameFile', 'qpm.excludeFile', 'qpm.toggleObjOption'].includes(entry.command) && String(entry.when).includes('qpmGeneratedFile')), 'generated files must not expose source-management actions');

console.log('QPM 0.17.7 generated workspace artifacts tests: PASS');
