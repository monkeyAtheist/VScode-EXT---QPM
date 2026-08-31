'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.30.0');

const source = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQmlLanguageService.ts'), 'utf8');
for (const marker of [
  "new RegistrationType<DidChangeWatchedFilesRegistrationOptions>('workspace.didChangeWatchedFiles')",
  'this.client.registerFeature(new QmllsDottedFileWatcherCompatibilityFeature',
  'private startPromise?: Promise<boolean>',
  'const result = await this.startPromise',
  'return !result && notify ? this.start(force, notify) : result',
  "'**/*.{qml,qmldir,qmltypes,js,mjs,cpp,cxx,cc,h,hpp,hxx}'",
  "'**/{CMakeLists.txt,*.cmake,*.qtproject.json,.qmlls.ini}'",
  "if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content) return target"
]) assert(source.includes(marker), `Missing QML compatibility marker: ${marker}`);

assert(!source.includes("return this.start(true, true)"), 'The conflict override must not recursively start a second qmlls operation.');
assert(source.includes("if (choice === 'Start QPM qmlls anyway') force = true"));
assert(source.includes('capabilities.workspace.didChangeWatchedFiles.dynamicRegistration = true'));
assert(source.includes('Accepted qmlls compatibility registration for workspace.didChangeWatchedFiles'));

const allScript = pkg.scripts['test:qt-all'];
assert(allScript.includes('test-qt-qmlls-compatibility-0131.js'));
assert(pkg.scripts['test:qml-language'].includes('test-qt-qmlls-compatibility-0131.js'));

console.log('QPM 0.13.1 qmlls watcher compatibility and serialized startup: PASS');
