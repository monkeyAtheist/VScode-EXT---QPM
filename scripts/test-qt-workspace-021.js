'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { QpmParser } = require('../out/model/qpmParser');
const qtManifest = require('../out/model/qtProjectManifest');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-native-workspace-'));
try {
  const projectRoot = path.join(root, 'QtWidgetsApp');
  fs.mkdirSync(projectRoot, { recursive: true });
  const manifestPath = path.join(projectRoot, 'QtWidgetsApp.qtproject.json');
  const manifest = qtManifest.createDefaultQtProjectManifest('QtWidgetsApp', 'widgets-application', ['Widgets']);
  qtManifest.writeQtProjectManifest(manifestPath, manifest);

  const parser = new QpmParser();
  const workspacePath = parser.createWorkspace(root, 'Qt_Workspace', manifestPath, undefined, 1200);
  assert(fs.existsSync(workspacePath), 'native Qt workspace file must be created');
  assert(fs.readFileSync(workspacePath, 'utf8').includes('QtWidgetsApp.qtproject.json'), 'workspace must reference the native Qt manifest');

  const workspace = parser.parseWorkspace(workspacePath);
  assert.strictEqual(workspace.name, 'Qt_Workspace');
  assert.strictEqual(workspace.projects.length, 1);
  assert.strictEqual(workspace.projects[0].name, 'QtWidgetsApp');
  assert.strictEqual(workspace.projects[0].absolutePath, manifestPath);
  assert.strictEqual(workspace.projects[0].exists, true);

  console.log('QPM 0.2.1 native Qt workspace tests: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
