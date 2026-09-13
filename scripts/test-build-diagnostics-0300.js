'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
assert.strictEqual(pkg.version, '0.33.0');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    class Position { constructor(line, character) { this.line = line; this.character = character; } }
    class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = new Position(startLine, startCharacter); this.end = new Position(endLine, endCharacter); } }
    class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
    return {
      Range,
      Diagnostic,
      DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { parseBuildDiagnostics, buildDiagnosticHint } = require(path.join(root, 'out/services/qpmBuildDiagnostics.js'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-build-diag-'));
  const source = path.join(tempRoot, 'src', 'mainwindow.cpp');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, [
    '#include "mainwindow.h"',
    '',
    'MainWindow::MainWindow(QWidget *parent)',
    '    : QMainWindow(parent)',
    '{',
    '    ui->setupUi(this);',
    '    int x = 0;',
    '    (void)x;',
    '',
    '    acqctrl = new AcquisitionControl(this);',
    '}'
  ].join('\n'));

  const gcc = `${source}:10:5: error: 'acqctrl' was not declared in this scope\n`;
  const diagnostics = parseBuildDiagnostics(gcc, tempRoot);
  assert.strictEqual(diagnostics.length, 1);
  assert.strictEqual(diagnostics[0].severity, 'error');
  assert.strictEqual(diagnostics[0].line, 10);
  assert.strictEqual(diagnostics[0].column, 5);
  assert.strictEqual(diagnostics[0].sourceLine, 'acqctrl = new AcquisitionControl(this);');
  assert(diagnostics[0].hint.includes('ui-><objectName>'));

  const linker = parseBuildDiagnostics("main.o: undefined reference to `Foo::bar()'\ncollect2.exe: error: ld returned 1 exit status\n", tempRoot);
  assert(linker.some((item) => item.message.includes('undefined reference')));
  assert(linker.some((item) => item.hint && item.hint.includes('linker error')));

  assert(buildDiagnosticHint('no matching function for call to qMin(int, double)').includes('argument types'));

  const buildSource = read('src/services/qpmBuildService.ts');
  assert(buildSource.includes("this.logSection('QT CODE GENERATION (MOC / UIC / RCC)')"));
  assert(buildSource.includes("this.logSection('C++ COMPILATION')"));
  assert(buildSource.includes("this.logSection('LINK')"));
  assert(buildSource.includes('Qt Project Manager - Build Trace'));
  assert(buildSource.includes('View -> Problems'));
  assert(buildSource.includes('parseBuildDiagnostics(combined, cwd)'));
  assert(buildSource.includes('Full command and unfiltered output'));

  const extensionSource = read('src/extension.ts');
  assert(extensionSource.includes("createOutputChannel('Qt Project Manager - Build Trace')"));
  assert(extensionSource.includes("register('qpm.showBuildProblems'"));
  assert(extensionSource.includes("register('qpm.showBuildTrace'"));

  assert(pkg.contributes.configuration.properties['qpm.buildLogDetail']);
  assert.strictEqual(pkg.contributes.configuration.properties['qpm.buildLogDetail'].default, 'normal');
  assert(pkg.contributes.commands.some((entry) => entry.command === 'qpm.showBuildProblems'));
  assert(pkg.contributes.commands.some((entry) => entry.command === 'qpm.showBuildTrace'));

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log('QPM 0.30.0 structured build diagnostics tests: PASS');
} finally {
  Module._load = originalLoad;
}
