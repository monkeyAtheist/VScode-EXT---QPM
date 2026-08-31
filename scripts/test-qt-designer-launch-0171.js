'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.30.0');

const projectSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtProjectService.ts'), 'utf8');
assert(projectSource.includes('windowsHide: false'), 'C++ Designer must preserve the validated pre-Python Windows launch behavior');
const starterStart = projectSource.indexOf('function widgetsMainWindowUi');
const starterEnd = projectSource.indexOf('function quickMainQml', starterStart);
assert(starterStart >= 0 && starterEnd > starterStart, 'Widgets starter UI generator must exist');
const starter = projectSource.slice(starterStart, starterEnd);
assert(starter.includes('<widget class="QWidget" name="centralWidget"/>'), 'Widgets starter must contain an empty central widget');
assert(!starter.includes('<layout class="QVBoxLayout"'), 'Widgets starter must not impose a layout before the user chooses one');

const templateSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmTemplateService.ts'), 'utf8');
const designerStart = templateSource.indexOf('function qtDesignerUi');
const designerEnd = templateSource.indexOf('function normalizeExtension', designerStart);
assert(designerStart >= 0 && designerEnd > designerStart, 'Designer file-template generator must exist');
const designerGenerator = templateSource.slice(designerStart, designerEnd);
assert(!designerGenerator.includes('QVBoxLayout'), 'New Designer forms created from QPM file templates must allow free positioning initially');

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert(readme.includes('Ctrl+0'), 'README must explain how to break an existing Qt layout');
assert(readme.includes('QtCreator\\bin\\qtcreator.exe'), 'README must document the Qt Creator integrated Designer launcher path');

console.log('QPM 0.17.7 Designer launch and free-form starter compatibility tests: PASS');
