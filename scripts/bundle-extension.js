'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'dist');
fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

esbuild.build({
  entryPoints: [path.join(root, 'out', 'extension.js')],
  outfile: path.join(outputDirectory, 'extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: false,
  minify: false,
  treeShaking: true,
  legalComments: 'none',
  logLevel: 'info'
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
