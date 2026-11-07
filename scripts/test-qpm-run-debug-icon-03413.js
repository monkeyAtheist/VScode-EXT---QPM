const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const command = pkg.contributes.commands.find(c => c.command === 'qpm.startQtDebugProfileWithoutBuild');
assert(command, 'Run Debug command must exist');
const valid = command.icon === '$(debug-alt)' || (command.icon && command.icon.light && command.icon.dark);
assert(valid, 'Run Debug must expose a valid native or themed icon');
const menu = pkg.contributes.menus['view/title'];
assert(menu.some(x => x.command === 'qpm.startQtDebugProfileWithoutBuild' && /qpm\.workspaceExplorer/.test(x.when || '')),
  'Run Debug must remain visible in the Qt Workspace toolbar');
console.log('QPM Run Debug icon compatibility regression: OK');
