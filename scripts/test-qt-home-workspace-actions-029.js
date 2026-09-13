'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.33.0');

const homePanel = fs.readFileSync(path.join(root, 'src', 'views', 'homePanel.ts'), 'utf8');
const createWorkspaceOccurrences = (homePanel.match(/data-command="qpm\.createWorkspaceProject"/g) || []).length;
assert(createWorkspaceOccurrences >= 2, 'workspace + native project creation must be available in both empty and loaded home states');
assert(homePanel.includes('Create another workspace + native Qt project'), 'loaded home state must expose explicit new-workspace creation');
assert(homePanel.includes('qpm.createProjectInWorkspace'), 'loaded .cws home state must expose project creation in the current workspace');
assert(homePanel.includes("path.extname(state.workspace).toLowerCase() === '.cws'"), 'add-project action must only be shown for a .cws workspace');
assert(homePanel.includes('Create standalone native Qt project'), 'standalone creation must remain available with an unambiguous label');

const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
const registrationStart = extension.indexOf("register('qpm.createProjectInWorkspace'");
assert(registrationStart >= 0, 'createProjectInWorkspace command must remain registered');
const registration = extension.slice(registrationStart, registrationStart + 700);
assert(registration.includes('await workspaces.createProjectInWorkspace()'), 'project creation must complete before follow-up preparation');
assert(registration.includes('await builds.prepareNativeQtGeneratedFiles()'), 'new project files must be prepared for MOC/UIC/RCC indexing');
assert(registration.includes('await cppTools.synchronizeNativeProject'), 'IntelliSense must be synchronized after adding a project to a workspace');

console.log('QPM 0.2.9 loaded-workspace home actions tests: PASS');
