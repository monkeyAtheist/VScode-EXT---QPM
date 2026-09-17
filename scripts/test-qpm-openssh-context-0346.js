const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
function assert(ok, msg) { if (!ok) throw new Error(msg); }
const command = (pkg.contributes.commands || []).find(c => c.command === 'qpm.openSshDeviceManager');
assert(command, 'qpm.openSshDeviceManager command contribution is missing');
assert(command.shortTitle === 'OpenSSH Device Manager', 'OpenSSH shortTitle missing');
for (const menuId of ['qpm.editorRoot', 'qpm.explorerRoot']) {
  const items = pkg.contributes.menus?.[menuId] || [];
  assert(items.some(i => i.command === 'qpm.openSshDeviceManager'), `${menuId} does not expose OpenSSH Device Manager`);
}
const tree = pkg.contributes.menus?.['view/item/context'] || [];
assert(tree.some(i => i.command === 'qpm.openSshDeviceManager' && String(i.when).includes('qpm.workspaceExplorer')), 'QPM workspace tree context menu missing OpenSSH Device Manager');
const src = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
assert(src.includes("register('qpm.openSshDeviceManager'"), 'runtime registration missing');
console.log('QPM 0.34.6 OpenSSH context menu test: OK');
