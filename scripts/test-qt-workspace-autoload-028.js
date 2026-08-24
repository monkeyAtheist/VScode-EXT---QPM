'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.2');

const association = require(path.join(root, 'out', 'utils', 'qpmWorkspaceAssociation.js'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-workspace-association-'));
try {
  const projectRoot = path.join(temp, 'QtWidgetsApp');
  const manifestPath = path.join(projectRoot, 'QtWidgetsApp.qtproject.json');
  const workspacePath = path.join(temp, 'Qt_Workspace.cws');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(manifestPath, '{}\n', 'utf8');
  fs.writeFileSync(workspacePath, '[Workspace Header]\n', 'utf8');

  const markerPath = association.writeQpmWorkspaceAssociation(projectRoot, workspacePath, manifestPath);
  assert.strictEqual(markerPath, path.join(projectRoot, '.vscode', 'qpm-workspace.json'));
  assert(fs.existsSync(markerPath), 'the association marker must be written in the exact project root');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  assert.strictEqual(marker.schemaVersion, 1);
  assert.strictEqual(marker.workspacePath, '../Qt_Workspace.cws');
  assert.strictEqual(marker.projectManifest, 'QtWidgetsApp.qtproject.json');
  assert.strictEqual(association.resolveQpmWorkspaceAssociation(projectRoot), workspacePath);
  assert.strictEqual(association.removeQpmWorkspaceAssociation(projectRoot, path.join(temp, 'Other.cws')), false, 'a marker must not be removed by an unrelated workspace');
  assert.strictEqual(association.removeQpmWorkspaceAssociation(projectRoot, workspacePath), true, 'removing a project from its workspace must remove the association');
  assert.strictEqual(association.resolveQpmWorkspaceAssociation(projectRoot), undefined);
  association.writeQpmWorkspaceAssociation(projectRoot, workspacePath, manifestPath);

  fs.unlinkSync(workspacePath);
  assert.strictEqual(association.resolveQpmWorkspaceAssociation(projectRoot), undefined, 'stale associations must not be restored');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

const workspaceService = fs.readFileSync(path.join(root, 'src', 'services', 'qpmWorkspaceService.ts'), 'utf8');
assert(workspaceService.includes('this.findAssociatedWorkspaceFromOpenFolders()'), 'activation and folder changes must inspect the project association marker');
assert(workspaceService.includes('this.writeWorkspaceAssociationMarkers();'), 'loading a workspace must persist associations before IntelliSense adds a folder');
assert(workspaceService.includes('Restoring workspace association'), 'association restoration must be visible in QPM diagnostics');

console.log('QPM 0.2.9 automatic workspace loading after project creation tests: PASS');
