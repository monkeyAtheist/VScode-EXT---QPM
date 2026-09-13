'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');

assert(source.includes('<div id="settingsStickyHeader" class="settings-sticky-header">'), 'toolbar and navigation must share a sticky wrapper');
assert(source.includes('.settings-sticky-header{position:sticky;top:0;z-index:8;background:var(--vscode-editor-background);isolation:isolate'), 'sticky wrapper must be opaque and isolated');
assert(source.includes('.toolbar{position:static;'), 'toolbar must no longer create an independent sticky layer');
assert(source.includes('.settings-nav{position:static;'), 'navigation must no longer create an independent sticky layer');
assert(source.includes('<nav id="pageNav" class="page-nav"'), 'thematic page navigation must be inside the sticky shell');
assert(source.includes("const stickyHeader = byId('settingsStickyHeader');"), 'offset calculation must measure the complete sticky wrapper');
assert(source.includes("stickyHeader.getBoundingClientRect().height + 8"), 'section scroll margin must use the complete wrapper height');
assert(!source.includes('--qpm-toolbar-offset'), 'obsolete independent toolbar offset must be removed');
assert(!source.includes('toolbarGap'), 'transparent toolbar margin gap calculation must be removed');

const wrapperStart = source.indexOf('<div id="settingsStickyHeader" class="settings-sticky-header">');
const toolbarStart = source.indexOf('<div id="settingsToolbar" class="toolbar">', wrapperStart);
const pageNavStart = source.indexOf('<nav id="pageNav" class="page-nav"', toolbarStart);
const navigationStart = source.indexOf('<div id="settingsNavigation" class="settings-nav">', pageNavStart);
const firstSection = source.indexOf('<section id="section-control"', navigationStart);
assert(wrapperStart >= 0 && toolbarStart > wrapperStart && pageNavStart > toolbarStart && navigationStart > pageNavStart && firstSection > navigationStart, 'sticky wrapper content order is invalid');
const betweenNavigationAndSection = source.slice(navigationStart, firstSection);
assert(betweenNavigationAndSection.includes('</div>\n</div>'), 'navigation and wrapper must both close before settings sections');

console.log('QPM 0.33.0 opaque unified settings header and page navigation: PASS');
