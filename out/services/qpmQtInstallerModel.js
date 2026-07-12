"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.installerGeneratedPaths = installerGeneratedPaths;
exports.resolveQtInstallerIdentity = resolveQtInstallerIdentity;
exports.renderQtIfwConfig = renderQtIfwConfig;
exports.renderQtIfwPackageXml = renderQtIfwPackageXml;
exports.renderQtIfwComponentScript = renderQtIfwComponentScript;
exports.renderInnoSetupScript = renderInnoSetupScript;
exports.renderNsisScript = renderNsisScript;
exports.sanitizeComponentId = sanitizeComponentId;
exports.normalizeNsisVersion = normalizeNsisVersion;
const path = __importStar(require("path"));
const qpmQtPackagingModel_1 = require("./qpmQtPackagingModel");
function installerGeneratedPaths(manifestPath, componentId) {
    const root = path.join(path.dirname(manifestPath), '.qpm', 'installer', 'generated');
    const safeComponent = sanitizeComponentId(componentId);
    const qtIfwRoot = path.join(root, 'qtifw');
    const packageRoot = path.join(qtIfwRoot, 'packages', safeComponent);
    return {
        root,
        qtIfwRoot,
        qtIfwConfig: path.join(qtIfwRoot, 'config', 'config.xml'),
        qtIfwPackages: path.join(qtIfwRoot, 'packages'),
        qtIfwPackageXml: path.join(packageRoot, 'meta', 'package.xml'),
        qtIfwComponentScript: path.join(packageRoot, 'meta', 'installscript.qs'),
        innoRoot: path.join(root, 'inno'),
        innoScript: path.join(root, 'inno', 'qpm-installer.iss'),
        nsisRoot: path.join(root, 'nsis'),
        nsisScript: path.join(root, 'nsis', 'qpm-installer.nsi')
    };
}
function resolveQtInstallerIdentity(manifest, mode) {
    const identity = (0, qpmQtPackagingModel_1.resolveQtPackageIdentity)(manifest, mode);
    const values = {
        productName: identity.productName,
        version: identity.version,
        platform: identity.platform,
        arch: identity.architecture,
        configuration: identity.configuration,
        target: manifest.targetName
    };
    const pattern = manifest.packaging.installer.fileNamePattern || '${productName}-${version}-${arch}-setup';
    const installerBaseName = (0, qpmQtPackagingModel_1.sanitizePackageName)(pattern.replace(/\$\{(productName|version|platform|arch|configuration|target)\}/g, (_, key) => values[key] || ''));
    return { ...identity, installerBaseName };
}
function renderQtIfwConfig(manifest, identity, executableName, iconBaseName = '') {
    const installer = manifest.packaging.installer;
    const ifw = installer.qtIfw;
    const remoteRepository = ifw.repositoryUrl
        ? `\n  <RemoteRepositories>\n    <Repository><Url>${xmlEscape(ifw.repositoryUrl)}</Url></Repository>\n  </RemoteRepositories>`
        : '';
    const runProgram = installer.runAfterInstall && isRunnableKind(manifest.kind)
        ? `\n  <RunProgram>@TargetDir@/${xmlEscape(executableName)}</RunProgram>\n  <RunProgramDescription>Run ${xmlEscape(identity.productName)}</RunProgramDescription>`
        : '';
    const icon = iconBaseName ? `\n  <InstallerApplicationIcon>${xmlEscape(iconBaseName)}</InstallerApplicationIcon>` : '';
    const controlScript = ifw.controlScript ? `\n  <ControlScript>${xmlEscape(path.basename(ifw.controlScript))}</ControlScript>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Installer>\n  <Name>${xmlEscape(identity.productName)}</Name>\n  <Version>${xmlEscape(identity.version)}</Version>\n  <Title>${xmlEscape(identity.productName)} Setup</Title>\n  <Publisher>${xmlEscape(manifest.packaging.companyName)}</Publisher>\n  <StartMenuDir>${xmlEscape(identity.productName)}</StartMenuDir>\n  <TargetDir>@ApplicationsDir@/${xmlEscape(installer.installDirectoryName)}</TargetDir>\n  <MaintenanceToolName>${xmlEscape(ifw.maintenanceToolName)}</MaintenanceToolName>\n  <WizardStyle>${xmlEscape(ifw.wizardStyle)}</WizardStyle>${icon}${runProgram}${controlScript}${remoteRepository}\n</Installer>\n`;
}
function renderQtIfwPackageXml(manifest, identity, releaseDate, hasScript) {
    const ifw = manifest.packaging.installer.qtIfw;
    const script = hasScript ? '\n  <Script>installscript.qs</Script>' : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Package>\n  <DisplayName>${xmlEscape(ifw.componentDisplayName)}</DisplayName>\n  <Description>${xmlEscape(ifw.componentDescription)}</Description>\n  <Version>${xmlEscape(identity.version)}</Version>\n  <ReleaseDate>${xmlEscape(releaseDate)}</ReleaseDate>\n  <Default>true</Default>\n  <Essential>true</Essential>${script}\n</Package>\n`;
}
function renderQtIfwComponentScript(manifest, executableName) {
    const installer = manifest.packaging.installer;
    const product = jsEscape(manifest.packaging.productName);
    const executable = jsEscape(executableName);
    const runnable = isRunnableKind(manifest.kind) && executableName.length > 0;
    const desktop = runnable && installer.createDesktopShortcut
        ? `\n        component.addOperation("CreateShortcut", "@TargetDir@/${executable}", "@DesktopDir@/${product}.lnk", "workingDirectory=@TargetDir@");`
        : '';
    const startMenu = runnable && installer.createStartMenuShortcut
        ? `\n        component.addOperation("CreateShortcut", "@TargetDir@/${executable}", "@StartMenuDir@/${product}.lnk", "workingDirectory=@TargetDir@");`
        : '';
    return `function Component() {}\n\nComponent.prototype.createOperations = function() {\n    component.createOperations();\n    if (systemInfo.productType === "windows") {${desktop}${startMenu}\n    }\n};\n`;
}
function renderInnoSetupScript(manifest, identity, projectRoot, stageDirectory, outputDirectory, outputBaseName) {
    const installer = manifest.packaging.installer;
    const inno = installer.inno;
    const targetExe = windowsExecutableName(manifest.targetName, manifest.kind);
    const iconPath = manifest.packaging.icon ? path.resolve(projectRoot, manifest.packaging.icon) : '';
    const icon = iconPath ? `\nSetupIconFile=${innoEscape(iconPath)}` : '';
    const architecture = inno.architecture === 'x64'
        ? 'ArchitecturesAllowed=x64compatible\nArchitecturesInstallIn64BitMode=x64compatible'
        : inno.architecture === 'x86-x64'
            ? 'ArchitecturesAllowed=x86compatible x64compatible\nArchitecturesInstallIn64BitMode=x64compatible'
            : 'ArchitecturesAllowed=x86compatible';
    const languageLines = inno.languages.map(renderInnoLanguage).join('\n');
    const icons = [];
    if (installer.createStartMenuShortcut && targetExe)
        icons.push(`Name: "{group}\\${innoEscape(identity.productName)}"; Filename: "{app}\\${innoEscape(targetExe)}"`);
    if (installer.createDesktopShortcut && targetExe)
        icons.push(`Name: "{autodesktop}\\${innoEscape(identity.productName)}"; Filename: "{app}\\${innoEscape(targetExe)}"`);
    const run = installer.runAfterInstall && targetExe ? `\n[Run]\nFilename: "{app}\\${innoEscape(targetExe)}"; Description: "Run ${innoEscape(identity.productName)}"; Flags: nowait postinstall skipifsilent\n` : '';
    const directives = inno.additionalDirectives.length ? `\n${inno.additionalDirectives.join('\n')}` : '';
    return `[Setup]\nAppId=${innoEscape(manifest.packaging.identifier)}\nAppName=${innoEscape(identity.productName)}\nAppVersion=${innoEscape(identity.version)}\nAppPublisher=${innoEscape(manifest.packaging.companyName)}\nAppPublisherURL=\nDefaultDirName={autopf}\\${innoEscape(installer.installDirectoryName)}\nDefaultGroupName=${innoEscape(identity.productName)}\nDisableProgramGroupPage=yes\nOutputDir=${innoEscape(outputDirectory)}\nOutputBaseFilename=${innoEscape(outputBaseName)}\nCompression=${innoEscape(inno.compression)}\nSolidCompression=${inno.solidCompression ? 'yes' : 'no'}\nPrivilegesRequired=${inno.privilegesRequired}\n${architecture}\nWizardStyle=modern\nUninstallDisplayName=${innoEscape(identity.productName)}\nVersionInfoVersion=${normalizeNsisVersion(identity.version)}\nVersionInfoCompany=${innoEscape(manifest.packaging.companyName)}\nVersionInfoDescription=${innoEscape(manifest.packaging.description)}${icon}${directives}\n\n[Files]\nSource: "${innoEscape(path.join(stageDirectory, '*'))}"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs\n\n[Languages]\n${languageLines || 'Name: "english"; MessagesFile: "compiler:Default.isl"'}\n\n[Icons]\n${icons.join('\n')}${run}`;
}
function renderNsisScript(manifest, identity, stageDirectory, outputPath) {
    const installer = manifest.packaging.installer;
    const nsis = installer.nsis;
    const targetExe = windowsExecutableName(manifest.targetName, manifest.kind);
    const perUser = nsis.requestExecutionLevel === 'user';
    const registryRoot = perUser ? 'HKCU' : 'HKLM';
    const programRoot = perUser ? '$LOCALAPPDATA' : identity.architecture === 'x64' ? '$PROGRAMFILES64' : '$PROGRAMFILES';
    const shortcuts = [];
    if (installer.createStartMenuShortcut && targetExe)
        shortcuts.push(`  CreateDirectory "$SMPROGRAMS\\${nsisEscape(identity.productName)}"\n  CreateShortCut "$SMPROGRAMS\\${nsisEscape(identity.productName)}\\${nsisEscape(identity.productName)}.lnk" "$INSTDIR\\${nsisEscape(targetExe)}"`);
    if (installer.createDesktopShortcut && targetExe)
        shortcuts.push(`  CreateShortCut "$DESKTOP\\${nsisEscape(identity.productName)}.lnk" "$INSTDIR\\${nsisEscape(targetExe)}"`);
    const run = installer.runAfterInstall && targetExe ? `\n  ExecShell "open" "$INSTDIR\\${nsisEscape(targetExe)}"` : '';
    const defines = nsis.additionalDefines.map((entry) => `!define ${entry}`).join('\n');
    return `Unicode True\n!include "MUI2.nsh"\n${defines ? `${defines}\n` : ''}Name "${nsisEscape(identity.productName)}"\nOutFile "${nsisEscape(outputPath)}"\nInstallDir "${programRoot}\\${nsisEscape(installer.installDirectoryName)}"\nInstallDirRegKey ${registryRoot} "Software\\${nsisEscape(manifest.packaging.identifier)}" "InstallDir"\nRequestExecutionLevel ${nsis.requestExecutionLevel}\nSetCompressor /SOLID ${nsis.compressor}\nVIProductVersion "${normalizeNsisVersion(identity.version)}"\nVIAddVersionKey "ProductName" "${nsisEscape(identity.productName)}"\nVIAddVersionKey "CompanyName" "${nsisEscape(manifest.packaging.companyName)}"\nVIAddVersionKey "FileDescription" "${nsisEscape(manifest.packaging.description)}"\nVIAddVersionKey "ProductVersion" "${nsisEscape(identity.version)}"\n\n!insertmacro MUI_PAGE_WELCOME\n!insertmacro MUI_PAGE_DIRECTORY\n!insertmacro MUI_PAGE_INSTFILES\n!insertmacro MUI_PAGE_FINISH\n!insertmacro MUI_UNPAGE_CONFIRM\n!insertmacro MUI_UNPAGE_INSTFILES\n!insertmacro MUI_LANGUAGE "English"\n\nSection "Install" SEC_MAIN\n  SetOutPath "$INSTDIR"\n  File /r "${nsisEscape(path.join(stageDirectory, '*'))}"\n  WriteRegStr ${registryRoot} "Software\\${nsisEscape(manifest.packaging.identifier)}" "InstallDir" "$INSTDIR"\n  WriteUninstaller "$INSTDIR\\Uninstall.exe"\n${shortcuts.join('\n')}${run}\nSectionEnd\n\nSection "Uninstall"\n  Delete "$DESKTOP\\${nsisEscape(identity.productName)}.lnk"\n  RMDir /r "$SMPROGRAMS\\${nsisEscape(identity.productName)}"\n  RMDir /r "$INSTDIR"\n  DeleteRegKey ${registryRoot} "Software\\${nsisEscape(manifest.packaging.identifier)}"\nSectionEnd\n`;
}
function sanitizeComponentId(value) {
    const result = value.trim().replace(/[^A-Za-z0-9_.-]+/g, '.').replace(/^\.+|\.+$/g, '');
    return result || 'com.example.application';
}
function normalizeNsisVersion(value) {
    const numbers = value.match(/\d+/g)?.slice(0, 4) ?? [];
    while (numbers.length < 4)
        numbers.push('0');
    return numbers.map((entry) => String(Math.max(0, Math.min(65535, Number(entry) || 0)))).join('.');
}
function windowsExecutableName(targetName, kind) {
    return isRunnableKind(kind) ? `${targetName}.exe` : '';
}
function isRunnableKind(kind) {
    return kind !== 'static-library' && kind !== 'shared-library';
}
function renderInnoLanguage(language) {
    const normalized = language.trim();
    if (!normalized || normalized.toLowerCase() === 'english')
        return 'Name: "english"; MessagesFile: "compiler:Default.isl"';
    if (normalized.includes(';') || normalized.includes('MessagesFile:'))
        return normalized;
    const fileName = `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.isl`;
    return `Name: "${innoEscape(normalized.toLowerCase())}"; MessagesFile: "compiler:Languages\\${innoEscape(fileName)}"`;
}
function xmlEscape(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function jsEscape(value) { return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' '); }
function innoEscape(value) { return String(value ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' '); }
function nsisEscape(value) { return String(value ?? '').replace(/\$/g, '$$').replace(/"/g, '$\\"').replace(/[\r\n]+/g, ' '); }
