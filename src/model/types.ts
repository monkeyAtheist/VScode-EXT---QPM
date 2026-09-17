export type QpmBuildMode = 'debug' | 'release' | 'debug64' | 'release64';
export type QpmProgramOutputMode = 'integrated-terminal' | 'output-channel' | 'detached';

export interface QpmRunOptions {
  arguments: string;
  workingDirectory: string;
  environmentOptions: string;
  externalProcessPath: string;
  outputMode: QpmProgramOutputMode;
}

export interface QpmWorkspaceProjectRef {
  index: number;
  relativePath: string;
  absolutePath: string;
  name: string;
  exists: boolean;
}

export interface QpmWorkspace {
  path: string;
  name: string;
  activeProjectIndex: number;
  projects: QpmWorkspaceProjectRef[];
  qpmDir?: string;
}

export interface QpmProjectFile {
  sectionName: string;
  id: number;
  type: string;
  folder: string;
  relativePath?: string;
  absolutePath: string;
  excluded: boolean;
  compileIntoObjectFile: boolean;
  exists: boolean;
}

export interface QpmProject {
  path: string;
  name: string;
  targetType: string;
  qpmDir?: string;
  folders: string[];
  files: QpmProjectFile[];
}

export interface QpmInstallation {
  root: string;
  label: string;
  compileExe?: string;
  ideExe?: string;
  clangCcExe?: string;
  cCompilerExe?: string;
  cppCompilerExe?: string;
  archiverExe?: string;
  debuggerExe?: string;
  source: 'configured' | 'workspace' | 'scan' | 'manual';
}
