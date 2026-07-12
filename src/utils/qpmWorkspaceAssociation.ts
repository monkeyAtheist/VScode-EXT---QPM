import * as fs from 'fs';
import * as path from 'path';

export const QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH = path.join('.vscode', 'qpm-workspace.json');

interface QpmWorkspaceAssociationDocument {
  schemaVersion: 1;
  workspacePath: string;
  projectManifest?: string;
}

export interface QpmWorkspaceAssociationInspection {
  markerPath: string;
  workspacePath?: string;
  projectManifestPath?: string;
  valid: boolean;
  stale: boolean;
  reason?: string;
}

function toPortableRelativePath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function writeQpmWorkspaceAssociation(projectRoot: string, workspacePath: string, projectManifestPath?: string): string {
  const normalizedRoot = path.resolve(projectRoot);
  const normalizedWorkspacePath = path.resolve(workspacePath);
  const relativeWorkspacePath = path.relative(normalizedRoot, normalizedWorkspacePath) || path.basename(normalizedWorkspacePath);
  const relativeManifestPath = projectManifestPath
    ? path.relative(normalizedRoot, path.resolve(projectManifestPath)) || path.basename(projectManifestPath)
    : undefined;

  const document: QpmWorkspaceAssociationDocument = {
    schemaVersion: 1,
    workspacePath: toPortableRelativePath(relativeWorkspacePath),
    ...(relativeManifestPath ? { projectManifest: toPortableRelativePath(relativeManifestPath) } : {})
  };
  const markerPath = path.join(normalizedRoot, QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH);
  const rendered = `${JSON.stringify(document, null, 2)}\n`;
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  const previous = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8') : undefined;
  if (previous !== rendered) {
    fs.writeFileSync(markerPath, rendered, 'utf8');
  }
  return markerPath;
}

export function inspectQpmWorkspaceAssociation(projectRoot: string, removeStale = false): QpmWorkspaceAssociationInspection {
  const normalizedRoot = path.resolve(projectRoot);
  const markerPath = path.join(normalizedRoot, QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH);
  if (!fs.existsSync(markerPath)) {
    return { markerPath, valid: false, stale: false, reason: 'association marker not found' };
  }

  const stale = (reason: string, workspacePath?: string, projectManifestPath?: string): QpmWorkspaceAssociationInspection => {
    if (removeStale) {
      try {
        fs.unlinkSync(markerPath);
        removeDirectoryIfEmpty(path.dirname(markerPath));
      } catch {
        // Keep startup resilient even when the stale file is read-only.
      }
    }
    return { markerPath, workspacePath, projectManifestPath, valid: false, stale: true, reason };
  };

  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as Partial<QpmWorkspaceAssociationDocument>;
    if (parsed.schemaVersion !== 1 || typeof parsed.workspacePath !== 'string' || !parsed.workspacePath.trim()) {
      return stale('invalid association document');
    }
    const workspacePath = path.isAbsolute(parsed.workspacePath)
      ? path.normalize(parsed.workspacePath)
      : path.resolve(normalizedRoot, parsed.workspacePath);
    const lower = workspacePath.toLowerCase();
    if (!lower.endsWith('.cws') && !lower.endsWith('.prj') && !lower.endsWith('.qtproject.json')) {
      return stale('unsupported associated workspace type', workspacePath);
    }
    if (!fs.existsSync(workspacePath)) {
      return stale('associated workspace no longer exists', workspacePath);
    }

    let projectManifestPath: string | undefined;
    if (typeof parsed.projectManifest === 'string' && parsed.projectManifest.trim()) {
      projectManifestPath = path.isAbsolute(parsed.projectManifest)
        ? path.normalize(parsed.projectManifest)
        : path.resolve(normalizedRoot, parsed.projectManifest);
      if (!fs.existsSync(projectManifestPath)) {
        return stale('associated project manifest no longer exists', workspacePath, projectManifestPath);
      }
    }

    return { markerPath, workspacePath, projectManifestPath, valid: true, stale: false };
  } catch {
    return stale('association document cannot be parsed');
  }
}

export function resolveQpmWorkspaceAssociation(projectRoot: string, removeStale = true): string | undefined {
  const inspection = inspectQpmWorkspaceAssociation(projectRoot, removeStale);
  return inspection.valid ? inspection.workspacePath : undefined;
}

export function removeQpmWorkspaceAssociation(projectRoot: string, expectedWorkspacePath?: string): boolean {
  const normalizedRoot = path.resolve(projectRoot);
  const markerPath = path.join(normalizedRoot, QPM_WORKSPACE_ASSOCIATION_RELATIVE_PATH);
  if (!fs.existsSync(markerPath)) {
    return false;
  }
  if (expectedWorkspacePath) {
    const resolved = resolveQpmWorkspaceAssociation(normalizedRoot);
    if (!resolved || path.normalize(resolved).toLowerCase() !== path.resolve(expectedWorkspacePath).toLowerCase()) {
      return false;
    }
  }
  try {
    fs.unlinkSync(markerPath);
    removeDirectoryIfEmpty(path.dirname(markerPath));
    return true;
  } catch {
    return false;
  }
}

function removeDirectoryIfEmpty(directory: string): void {
  try {
    if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
      fs.rmdirSync(directory);
    }
  } catch {
    // Best-effort cleanup only.
  }
}
