'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const symbolKind = { Function: 11, Method: 5, Constructor: 8, 11: 'Function', 5: 'Method', 8: 'Constructor' };
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return { SymbolKind: symbolKind };
  return originalLoad.call(this, request, parent, isMain);
};
const symbols = require(path.join(root, 'out', 'services', 'qpmSymbolService.js'));
Module._load = originalLoad;

const source = `
#include "widget.hpp"
#include <QString>

static int helper(int value = 4)
{
    return value;
}

Widget::Widget(QObject *parent)
{
}

QString Widget::text(int precision) const
{
    return {};
}

void Widget::refresh() noexcept
{
}
`;
const samplePath = path.join(root, '.tmp-qpm-03410-widget.cpp');
fs.writeFileSync(samplePath, source, 'utf8');
const detected = symbols.scanCFunctions(source, samplePath);
const generated = symbols.buildSourceFromSourceSymbols(detected, samplePath);
assert(generated.includes('#include "widget.hpp"'));
assert(generated.includes('#include <QString>'));
assert(generated.includes('#include <cstdlib>'));
assert(generated.includes('static int helper(int value)'));
assert(!generated.includes('value = 4'));
assert(generated.includes('Widget::Widget(QObject *parent)'));
assert(generated.includes('QString Widget::text(int precision) const'));
assert(generated.includes('void Widget::refresh() noexcept'));
assert(generated.includes('std::abort();'));
const ctorBlock = generated.slice(generated.indexOf('Widget::Widget'), generated.indexOf('QString Widget::text'));
assert(!ctorBlock.includes('std::abort();'));
fs.rmSync(samplePath, { force: true });
console.log('QPM 0.34.10 source-from-file-symbol generation checks: OK');
