import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface QpmDeploymentStageResult {
  sourceHash: string;
  targetHash: string;
  size: number;
  replacedExistingTarget: boolean;
}

/**
 * Stage the just-built executable/library into the standalone deployment tree.
 *
 * The destination is deliberately replaced instead of overwritten in place.
 * On Windows this gives the deployed binary a fresh file identity, which helps
 * Explorer invalidate stale executable-icon metadata after the PE resources
 * (for example the application .ico) change between builds.
 */
export function stageDeploymentTarget(sourcePath: string, targetPath: string): QpmDeploymentStageResult {
  const source = path.resolve(sourcePath);
  const target = path.resolve(targetPath);
  if (!fs.existsSync(source)) throw new Error(`Deployment source does not exist: ${source}`);

  const sourceHash = sha256File(source);
  const sourceSize = fs.statSync(source).size;
  if (sameFilePath(source, target)) {
    touchDeploymentTarget(target);
    return { sourceHash, targetHash: sourceHash, size: sourceSize, replacedExistingTarget: false };
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const replacedExistingTarget = fs.existsSync(target);
  const temporaryTarget = path.join(
    path.dirname(target),
    `.${path.basename(target)}.qpm-stage-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  try {
    fs.copyFileSync(source, temporaryTarget);
    const temporaryHash = sha256File(temporaryTarget);
    if (temporaryHash !== sourceHash || fs.statSync(temporaryTarget).size !== sourceSize) {
      throw new Error('The staged deployment binary does not match the build output.');
    }

    // Never overwrite the previous file in place. Removing it first is
    // intentional: Windows Explorer can otherwise keep the previous PE icon in
    // its path-based icon cache even though the file contents changed.
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
    fs.renameSync(temporaryTarget, target);
    touchDeploymentTarget(target);

    const targetHash = sha256File(target);
    if (targetHash !== sourceHash || fs.statSync(target).size !== sourceSize) {
      throw new Error('The deployed target differs from the build output after staging.');
    }
    return { sourceHash, targetHash, size: sourceSize, replacedExistingTarget };
  } finally {
    try { if (fs.existsSync(temporaryTarget)) fs.rmSync(temporaryTarget, { force: true }); } catch { /* best effort */ }
  }
}

export function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function touchDeploymentTarget(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const now = new Date();
  fs.utimesSync(filePath, now, now);
}

function sameFilePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}
