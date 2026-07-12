'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const direct = require('../out/services/qpmQtDirectBuildService');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-deps-026-'));
try {
  const source = path.join(root, 'main.cpp');
  const header = path.join(root, 'include', 'widget header.h');
  const object = path.join(root, 'obj', 'main.o');
  const dependency = direct.qtDependencyPathForObject(object);
  fs.mkdirSync(path.dirname(header), { recursive: true });
  fs.mkdirSync(path.dirname(object), { recursive: true });
  fs.writeFileSync(source, '#include "widget header.h"\n');
  fs.writeFileSync(header, '#pragma once\n');
  fs.writeFileSync(object, 'object');
  fs.writeFileSync(dependency, `${object}: ${source} ${header.replace(/ /g, '\\ ')}\n`);
  const now = Date.now() / 1000;
  fs.utimesSync(source, now - 30, now - 30);
  fs.utimesSync(header, now - 20, now - 20);
  fs.utimesSync(object, now - 10, now - 10);
  fs.utimesSync(dependency, now - 10, now - 10);
  assert.strictEqual(direct.sourceNeedsCompilation(source, object, [], false), false);
  fs.utimesSync(header, now + 5, now + 5);
  assert.strictEqual(direct.sourceNeedsCompilation(source, object, [], false), true);
  fs.unlinkSync(dependency);
  assert.strictEqual(direct.sourceNeedsCompilation(source, object, [], false), true);

  const fakePlan = { manifest: {}, buildProfile: { cppStandard: 'c++20' }, compilerFlags: [], defines: [], includeDirectories: [] };
  const args = direct.qtCompileArguments(fakePlan, source, object);
  assert(args.includes('-MMD'));
  assert(args.includes('-MP'));
  assert(args.includes('-MF'));
  assert(args.includes(dependency));
  console.log('QPM 0.2.6 per-source dependency file tests: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
