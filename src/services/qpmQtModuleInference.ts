import * as fs from 'fs';
import * as path from 'path';
import { QtProjectManifest, resolveQtProjectFiles } from '../model/qtProjectManifest';

export interface QpmQtModuleEvidence {
  module: string;
  files: string[];
  symbols: string[];
}

export interface QpmQtModuleInference {
  modules: string[];
  evidence: QpmQtModuleEvidence[];
}

const MAX_SCANNED_FILE_SIZE = 2 * 1024 * 1024;

const SYMBOL_MODULES: ReadonlyArray<{ module: string; symbols: readonly string[] }> = [
  { module: 'OpenGLWidgets', symbols: ['QOpenGLWidget'] },
  { module: 'QuickWidgets', symbols: ['QQuickWidget'] },
  { module: 'MultimediaWidgets', symbols: ['QVideoWidget', 'QGraphicsVideoItem'] },
  { module: 'SvgWidgets', symbols: ['QSvgWidget'] },
  { module: 'Charts', symbols: ['QChartView', 'QChart'] },
  { module: 'PrintSupport', symbols: ['QPrinter', 'QPrintDialog', 'QPageSetupDialog', 'QPrintPreviewDialog', 'QPrintPreviewWidget'] },
  { module: 'WebEngineWidgets', symbols: ['QWebEngineView', 'QWebEnginePage', 'QWebEngineProfile'] },
  { module: 'PdfWidgets', symbols: ['QPdfView'] },
  { module: 'Pdf', symbols: ['QPdfDocument', 'QPdfPageNavigator', 'QPdfSearchModel'] },
  { module: 'WebSockets', symbols: ['QWebSocket', 'QWebSocketServer'] },
  { module: 'HttpServer', symbols: ['QHttpServer', 'QHttpServerRequest', 'QHttpServerResponse'] },
  { module: 'SerialPort', symbols: ['QSerialPort', 'QSerialPortInfo'] },
  { module: 'SerialBus', symbols: ['QCanBus', 'QCanBusDevice', 'QCanBusFrame', 'QModbusClient', 'QModbusServer'] },
  { module: 'Bluetooth', symbols: ['QBluetoothDeviceDiscoveryAgent', 'QBluetoothSocket', 'QLowEnergyController'] },
  { module: 'Sql', symbols: ['QSqlDatabase', 'QSqlQuery', 'QSqlTableModel'] },
  { module: 'Test', symbols: ['QTest', 'QSignalSpy'] }
];

/**
 * Detect Qt modules that are required by project files but are not necessarily
 * listed explicitly in the manifest. Qt Designer can introduce such a
 * dependency when a widget is dropped into a .ui form (for example,
 * QOpenGLWidget requires Qt OpenGL Widgets in Qt 6).
 */
export function inferQtModulesFromProject(manifestPath: string, manifest: QtProjectManifest): QpmQtModuleInference {
  const root = path.dirname(manifestPath);
  const files = resolveQtProjectFiles(manifestPath, manifest);
  const candidates = uniquePaths([...files.sources, ...files.headers, ...files.forms]);
  const evidence = new Map<string, { files: Set<string>; symbols: Set<string> }>();

  const addEvidence = (module: string, filePath: string, symbol: string): void => {
    const normalizedModule = normalizeModuleName(module);
    if (!normalizedModule) return;
    let entry = evidence.get(normalizedModule.toLowerCase());
    if (!entry) {
      entry = { files: new Set<string>(), symbols: new Set<string>() };
      evidence.set(normalizedModule.toLowerCase(), entry);
    }
    entry.files.add(toProjectRelativePath(root, filePath));
    entry.symbols.add(symbol);
  };

  for (const filePath of candidates) {
    const content = readSmallTextFile(filePath);
    if (content === undefined) continue;

    for (const match of content.matchAll(/#\s*include\s*[<"]Qt([A-Za-z0-9]+)\//g)) {
      addEvidence(match[1], filePath, `Qt${match[1]} include`);
    }

    for (const mapping of SYMBOL_MODULES) {
      for (const symbol of mapping.symbols) {
        if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(content)) {
          addEvidence(mapping.module, filePath, symbol);
        }
      }
    }
  }

  const orderedEvidence = Array.from(evidence.entries())
    .map(([key, value]) => ({
      module: canonicalModuleName(key),
      files: Array.from(value.files).sort((a, b) => a.localeCompare(b)),
      symbols: Array.from(value.symbols).sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.module.localeCompare(b.module));

  return {
    modules: orderedEvidence.map((entry) => entry.module),
    evidence: orderedEvidence
  };
}

export function effectiveQtModules(manifestPath: string, manifest: QtProjectManifest): QpmQtModuleInference {
  const inferred = inferQtModulesFromProject(manifestPath, manifest);
  const modules: string[] = [];
  const seen = new Set<string>();
  for (const module of [...manifest.qt.modules, ...inferred.modules]) {
    const normalized = normalizeModuleName(module);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    modules.push(normalized);
  }
  return { modules, evidence: inferred.evidence };
}

export function describeAutoDetectedQtModules(manifest: QtProjectManifest, inference: QpmQtModuleInference): string[] {
  const configured = new Set(manifest.qt.modules.map((entry) => entry.toLowerCase()));
  return inference.evidence
    .filter((entry) => !configured.has(entry.module.toLowerCase()))
    .map((entry) => `${entry.module} (${entry.symbols.join(', ')} in ${entry.files.join(', ')})`);
}

function readSmallTextFile(filePath: string): string | undefined {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SCANNED_FILE_SIZE) return undefined;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function toProjectRelativePath(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  return (relative || path.basename(filePath)).replace(/\\/g, '/');
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = path.normalize(value);
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeModuleName(value: string): string {
  const trimmed = value.trim().replace(/^Qt(?:5|6)?::?/i, '').replace(/^Qt/i, '');
  if (!trimmed) return '';
  return canonicalModuleName(trimmed.toLowerCase());
}

function canonicalModuleName(key: string): string {
  const known: Record<string, string> = {
    core: 'Core', core5compat: 'Core5Compat', gui: 'Gui', widgets: 'Widgets', network: 'Network', concurrent: 'Concurrent',
    serialport: 'SerialPort', serialbus: 'SerialBus', bluetooth: 'Bluetooth', sql: 'Sql', xml: 'Xml',
    multimedia: 'Multimedia', multimediawidgets: 'MultimediaWidgets', opengl: 'OpenGL', openglwidgets: 'OpenGLWidgets',
    printsupport: 'PrintSupport', qml: 'Qml', qmlmodels: 'QmlModels', quick: 'Quick', quickcontrols2: 'QuickControls2',
    quickwidgets: 'QuickWidgets', quicktest: 'QuickTest', svg: 'Svg', svgwidgets: 'SvgWidgets', charts: 'Charts',
    statemachine: 'StateMachine', websockets: 'WebSockets', httpserver: 'HttpServer', positioning: 'Positioning', sensors: 'Sensors', test: 'Test',
    webenginecore: 'WebEngineCore', webenginequick: 'WebEngineQuick', webenginewidgets: 'WebEngineWidgets', pdf: 'Pdf', pdfwidgets: 'PdfWidgets'
  };
  return known[key] ?? key.replace(/(^|[^A-Za-z0-9])([A-Za-z0-9])/g, (_match, _prefix, char: string) => char.toUpperCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
