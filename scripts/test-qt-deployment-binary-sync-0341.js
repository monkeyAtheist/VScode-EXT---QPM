'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../out/services/qpmDeploymentFileSync');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-0341-deploy-sync-'));
try {
  const buildExe = path.join(root, 'build', 'release', 'Demo.exe');
  const distExe = path.join(root, 'dist', 'release', 'Demo.exe');
  fs.mkdirSync(path.dirname(buildExe), { recursive: true });
  fs.mkdirSync(path.dirname(distExe), { recursive: true });
  fs.writeFileSync(buildExe, Buffer.from('fresh-pe-with-new-icon-resource'));
  fs.writeFileSync(distExe, Buffer.from('old-pe-with-old-icon-resource'));
  const oldStat = fs.statSync(distExe);

  const result = sync.stageDeploymentTarget(buildExe, distExe);
  assert.strictEqual(result.replacedExistingTarget, true);
  assert.strictEqual(fs.readFileSync(distExe).toString(), 'fresh-pe-with-new-icon-resource');
  assert.strictEqual(result.sourceHash, sync.sha256File(buildExe));
  assert.strictEqual(result.targetHash, sync.sha256File(distExe));
  assert.strictEqual(result.sourceHash, result.targetHash);
  const newStat = fs.statSync(distExe);
  if (typeof oldStat.ino === 'number' && typeof newStat.ino === 'number' && oldStat.ino !== 0 && newStat.ino !== 0) {
    assert.notStrictEqual(newStat.ino, oldStat.ino, 'deployment target should be replaced, not overwritten in place');
  }

  const same = sync.stageDeploymentTarget(buildExe, buildExe);
  assert.strictEqual(same.replacedExistingTarget, false);
  assert.strictEqual(same.sourceHash, sync.sha256File(buildExe));

  console.log('QPM 0.34.1 deployment binary synchronization tests: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
