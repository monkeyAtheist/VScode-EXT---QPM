'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.2');

const cleanup = require('../out/services/qpmBuildCleanup.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-clean-deferred-0152-'));
const originalMkdirSync = fs.mkdirSync;
const originalRenameSync = fs.renameSync;

function createBuildTree(name) {
  const modeDirectory = path.join(temp, name, 'build', 'debug');
  const generatedDirectory = path.join(modeDirectory, 'generated');
  const objectDirectory = path.join(modeDirectory, 'obj');
  fs.mkdirSync(generatedDirectory, { recursive: true });
  fs.mkdirSync(objectDirectory, { recursive: true });
  fs.writeFileSync(path.join(generatedDirectory, 'ui_mainwindow.h'), 'old');
  fs.writeFileSync(path.join(objectDirectory, 'main.o'), 'old');
  fs.writeFileSync(path.join(modeDirectory, `${name}.exe`), 'old');
  return { modeDirectory, generatedDirectory, objectDirectory };
}

(async () => {
  try {
    // Atomic rename path: clean must not recreate generated/obj immediately.
    const atomic = createBuildTree('Atomic');
    fs.mkdirSync = function guardedMkdir(candidate, options) {
      const normalized = path.normalize(String(candidate));
      if (normalized === atomic.generatedDirectory || normalized === atomic.objectDirectory) {
        const error = new Error(`EPERM simulated mkdir ${normalized}`);
        error.code = 'EPERM';
        throw error;
      }
      return originalMkdirSync.call(fs, candidate, options);
    };
    const atomicResult = await cleanup.cleanQtDirectModeDirectory({
      modeDirectory: atomic.modeDirectory,
      requiredDirectories: [atomic.generatedDirectory, atomic.objectDirectory],
      retryCount: 2,
      retryDelayMs: 5
    });
    assert.strictEqual(atomicResult.success, true);
    assert.strictEqual(atomicResult.strategy, 'rename');
    assert(!fs.existsSync(atomic.modeDirectory), 'atomic clean should leave the mode directory absent');

    // Absent path: clean must also complete without trying to mkdir a skeleton.
    const absentMode = path.join(temp, 'Absent', 'build', 'debug');
    const absentGenerated = path.join(absentMode, 'generated');
    const absentObj = path.join(absentMode, 'obj');
    const absentResult = await cleanup.cleanQtDirectModeDirectory({
      modeDirectory: absentMode,
      requiredDirectories: [absentGenerated, absentObj],
      retryCount: 2,
      retryDelayMs: 5
    });
    assert.strictEqual(absentResult.success, true);
    assert.strictEqual(absentResult.strategy, 'absent');
    assert(!fs.existsSync(absentMode));

    // In-place fallback: preserve directory roots and clear their contents,
    // still without calling mkdir.
    fs.mkdirSync = originalMkdirSync;
    const fallback = createBuildTree('Fallback');
    fs.mkdirSync = function guardedMkdir(candidate, options) {
      const normalized = path.normalize(String(candidate));
      if (normalized === fallback.generatedDirectory || normalized === fallback.objectDirectory) {
        const error = new Error(`EPERM simulated mkdir ${normalized}`);
        error.code = 'EPERM';
        throw error;
      }
      return originalMkdirSync.call(fs, candidate, options);
    };
    fs.renameSync = function guardedRename(source, destination) {
      if (path.normalize(String(source)) === fallback.modeDirectory) {
        const error = new Error('EPERM simulated rename');
        error.code = 'EPERM';
        throw error;
      }
      return originalRenameSync.call(fs, source, destination);
    };
    const fallbackResult = await cleanup.cleanQtDirectModeDirectory({
      modeDirectory: fallback.modeDirectory,
      requiredDirectories: [fallback.generatedDirectory, fallback.objectDirectory],
      retryCount: 2,
      retryDelayMs: 5
    });
    assert.strictEqual(fallbackResult.success, true);
    assert.strictEqual(fallbackResult.strategy, 'in-place');
    assert(fs.statSync(fallback.generatedDirectory).isDirectory());
    assert(fs.statSync(fallback.objectDirectory).isDirectory());
    assert.deepStrictEqual(fs.readdirSync(fallback.generatedDirectory), []);
    assert.deepStrictEqual(fs.readdirSync(fallback.objectDirectory), []);
    assert(!fs.existsSync(path.join(fallback.modeDirectory, 'Fallback.exe')));

    const cleanupSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmBuildCleanup.ts'), 'utf8');
    assert(cleanupSource.includes('do not recreate `generated`/`obj` from the clean'));
    assert(!cleanupSource.includes('ensureDirectories(requiredDirectories)'));
    const buildSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmBuildService.ts'), 'utf8');
    assert(buildSource.includes('Build directories will be recreated by the next build'));

    console.log('QPM 0.15.2 deferred build-directory recreation and EPERM-safe clean: PASS');
  } finally {
    fs.mkdirSync = originalMkdirSync;
    fs.renameSync = originalRenameSync;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  fs.mkdirSync = originalMkdirSync;
  fs.renameSync = originalRenameSync;
  console.error(error);
  process.exitCode = 1;
});
