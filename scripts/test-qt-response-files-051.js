'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.2');

const rsp = require('../out/services/qpmGnuResponseFile');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-response-051-'));
try {
  const userProject = 'c:\\Users\\jerry\\Downloads\\QTtestV3\\QtTestApp';
  const qtRoot = 'C:\\Qt\\Qt6.11.0\\6.11.0\\mingw_64';
  const args = [
    '-mwindows',
    `${userProject}\\build\\debug\\obj\\src_main.cpp.8fb74478.o`,
    `${userProject}\\build\\debug\\obj\\src_mainwindow.cpp.247846e5.o`,
    '-L', `${qtRoot}\\lib`,
    '-lmingw32',
    `${qtRoot}\\lib\\libQt6EntryPoint.a`,
    '-lQt6Widgets', '-lQt6Gui', '-lQt6Core', '-lshell32',
    '-o', `${userProject}\\build\\debug\\QtTestApp.exe`
  ];

  assert.strictEqual(rsp.shouldUseGnuResponseFile(args, 'win32'), false, 'small projects must not use a response file');
  const longArgs = Array.from({ length: 800 }, (_, index) => `${userProject}\\build\\debug\\obj\\very_long_object_name_${index}.o`);
  assert.strictEqual(rsp.shouldUseGnuResponseFile(longArgs, 'win32'), true, 'long Windows linker commands must use a response file');

  const file = path.join(temp, 'qpm_link.rsp');
  assert.deepStrictEqual(rsp.createGnuResponseFileArguments(args, file), [`@${file}`]);
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes('c:/Users/jerry/Downloads/QTtestV3/QtTestApp/build/debug/obj/src_main.cpp.8fb74478.o'));
  assert(text.includes('C:/Qt/Qt6.11.0/6.11.0/mingw_64/lib/libQt6EntryPoint.a'));
  assert(!text.includes('c:\\Users\\jerry'), 'drive-qualified Windows paths must not retain response-file backslashes');
  assert(!text.includes('C:\\Qt\\Qt6.11.0'), 'Qt paths must be serialized with GNU-safe separators');

  const spaced = rsp.quoteGnuResponseArgument('C:\\Program Files\\Qt\\lib\\Qt6Core.lib');
  assert.strictEqual(spaced, '"C:/Program Files/Qt/lib/Qt6Core.lib"');
  const implib = rsp.quoteGnuResponseArgument('-Wl,--out-implib,C:\\build\\Signal Tools.dll.a');
  assert.strictEqual(implib, '"-Wl,--out-implib,C:/build/Signal Tools.dll.a"');
  const escaped = rsp.quoteGnuResponseArgument('-DVALUE=\\"quoted\\"');
  assert(escaped.includes('\\\\'), 'non-path backslashes must be escaped rather than discarded');

  // Validate the serialized quoting with a real GNU linker when one is available.
  const gxx = childProcess.spawnSync('g++', ['--version'], { encoding: 'utf8' });
  if (gxx.status === 0) {
    const spacedRoot = path.join(temp, 'Project With Spaces');
    fs.mkdirSync(spacedRoot, { recursive: true });
    const source = path.join(spacedRoot, 'main file.cpp');
    const object = path.join(spacedRoot, 'main file.o');
    const target = path.join(spacedRoot, 'response file app');
    fs.writeFileSync(source, 'int main(){return 0;}\n', 'utf8');
    assert.strictEqual(childProcess.spawnSync('g++', ['-c', source, '-o', object]).status, 0);
    const realRsp = path.join(spacedRoot, 'link args.rsp');
    rsp.createGnuResponseFileArguments([object, '-o', target], realRsp);
    const linked = childProcess.spawnSync('g++', [`@${realRsp}`], { encoding: 'utf8' });
    assert.strictEqual(linked.status, 0, linked.stderr || linked.stdout);
    assert(fs.existsSync(target), 'real GNU response-file link must produce the target');
  }

  console.log('QPM 0.5.1 GNU/MinGW response-file regression tests: PASS');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
