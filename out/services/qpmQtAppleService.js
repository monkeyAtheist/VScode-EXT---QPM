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
exports.QpmQtAppleService = void 0;
exports.isApplePlatform = isApplePlatform;
exports.applePlatformLabel = applePlatformLabel;
exports.parseSimctlDevices = parseSimctlDevices;
exports.generateAppleCMakeProject = generateAppleCMakeProject;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtModuleInference_1 = require("./qpmQtModuleInference");
class QpmQtAppleService {
    workspaces;
    builds;
    qtInstallations;
    output;
    changed = new vscode.EventEmitter();
    onDidChange = this.changed.event;
    disposables = [];
    latestArtifactValue = '';
    constructor(workspaces, builds, qtInstallations, output) {
        this.workspaces = workspaces;
        this.builds = builds;
        this.qtInstallations = qtInstallations;
        this.output = output;
        this.disposables.push(workspaces.onDidChange(() => this.changed.fire()));
    }
    dispose() {
        for (const disposable of this.disposables)
            disposable.dispose();
        this.changed.dispose();
    }
    get activeProfile() {
        const context = this.readManifestContext(false);
        return context?.platform;
    }
    get latestArtifactPath() { return this.latestArtifactValue; }
    detectEnvironment(profile) {
        const active = profile ?? this.activeProfile;
        const platform = active && isApplePlatform(active.type) ? active.type : 'none';
        const hostSupported = process.platform === 'darwin';
        const tools = {};
        const details = [];
        const context = this.readManifestContext(false);
        const qt = context ? this.resolveQtInstallation(context.manifest) : undefined;
        const developerDirectory = resolveDeveloperDirectory(active);
        tools['xcode-select'] = resolveExecutable('', 'xcode-select');
        tools.xcodebuild = firstExisting([active?.appleXcodebuildPath, resolveWithXcrun(active, 'xcodebuild'), '/usr/bin/xcodebuild', findOnPath('xcodebuild')]);
        tools.xcrun = firstExisting([active?.appleXcrunPath, '/usr/bin/xcrun', findOnPath('xcrun')]);
        tools.codesign = firstExisting(['/usr/bin/codesign', resolveWithXcrun(active, 'codesign'), findOnPath('codesign')]);
        tools.security = firstExisting(['/usr/bin/security', findOnPath('security')]);
        tools.hdiutil = firstExisting(['/usr/bin/hdiutil', findOnPath('hdiutil')]);
        tools.ditto = firstExisting(['/usr/bin/ditto', findOnPath('ditto')]);
        tools.spctl = firstExisting(['/usr/sbin/spctl', findOnPath('spctl')]);
        tools.pkgbuild = firstExisting(['/usr/bin/pkgbuild', findOnPath('pkgbuild')]);
        tools.productbuild = firstExisting(['/usr/bin/productbuild', findOnPath('productbuild')]);
        tools.macdeployqt = firstExisting([active?.appleMacDeployQtPath, qt?.deployToolPath, qt ? path.join(qt.binDir, 'macdeployqt') : '', findOnPath('macdeployqt')]);
        tools['qt-cmake'] = qt ? firstExisting([path.join(qt.binDir, 'qt-cmake'), path.join(qt.root, 'bin', 'qt-cmake')]) : undefined;
        tools.cmake = firstExisting([qt?.cmakePath, findOnPath('cmake')]);
        let xcodeVersion;
        if (hostSupported && tools.xcodebuild) {
            xcodeVersion = safeExec(tools.xcodebuild, ['-version'], createAppleEnvironment(active)).trim().replace(/\r?\n/g, ' · ') || undefined;
        }
        const simulators = hostSupported && tools.xcrun ? this.listSimulatorsWithTool(tools.xcrun, active) : [];
        let ready = platform !== 'none' && hostSupported;
        if (!active || platform === 'none') {
            ready = false;
            details.push('Select a macOS, iOS Simulator or iOS Device platform profile.');
        }
        if (!hostSupported) {
            ready = false;
            details.push('Apple platform workflows require VS Code and QPM to run on macOS.');
        }
        if (!qt) {
            ready = false;
            details.push('The Qt installation assigned to the active build profile could not be resolved.');
        }
        else {
            details.push(`Qt kit: ${qt.label}.`);
        }
        if (!developerDirectory) {
            ready = false;
            details.push('The active Xcode developer directory could not be resolved.');
        }
        else {
            details.push(`Xcode developer directory: ${developerDirectory}.`);
        }
        if (!tools.xcodebuild || !tools.xcrun) {
            ready = false;
            details.push('xcodebuild and xcrun are required. Install Xcode and its command-line tools.');
        }
        if (platform === 'macos') {
            if (!tools.macdeployqt) {
                ready = false;
                details.push('macdeployqt was not found in the selected Qt kit or configured override.');
            }
            if (active?.appleCodeSignIdentity && !tools.codesign) {
                ready = false;
                details.push('codesign was not found.');
            }
            details.push(`Architectures: ${active?.appleArchitectures.join(', ') || 'automatic'}.`);
            details.push(active?.appleCreateDmg ? `DMG creation enabled (${active.appleDmgFileSystem}).` : 'DMG creation disabled.');
        }
        if (platform === 'ios-simulator') {
            if (!simulators.length)
                details.push('No available iOS simulator was detected. Install an iOS simulator runtime in Xcode.');
            if (!active?.appleSimulatorId)
                details.push('No simulator is selected; QPM will use a booted simulator or ask at run time.');
        }
        if (platform === 'ios-device') {
            if (!active?.appleDevelopmentTeam)
                details.push('A development team is normally required for signing and deployment to a physical iOS device.');
            if (!active?.appleDeviceId)
                details.push('No physical iOS device identifier is configured.');
        }
        if (active?.appleNotaryProfile)
            details.push(`Notarytool keychain profile: ${active.appleNotaryProfile}.`);
        else if (platform === 'macos')
            details.push('No notarytool keychain profile is configured.');
        return {
            platform,
            hostSupported,
            ready,
            summary: ready ? `${applePlatformLabel(platform)} is ready` : `${applePlatformLabel(platform)} needs configuration`,
            qtRoot: qt?.root,
            developerDirectory,
            xcodeVersion,
            tools,
            simulators,
            details
        };
    }
    async configureEnvironment() {
        const context = this.readManifestContext();
        if (!context)
            return;
        const profile = context.platform;
        if (!isApplePlatform(profile.type)) {
            const selected = await vscode.window.showQuickPick([
                { label: 'macOS desktop', value: 'macos' },
                { label: 'iOS Simulator', value: 'ios-simulator' },
                { label: 'iOS physical device', value: 'ios-device' }
            ], { title: 'Select an Apple platform for this profile' });
            if (!selected)
                return;
            profile.type = selected.value;
        }
        while (true) {
            const report = this.detectEnvironment(profile);
            const action = await vscode.window.showQuickPick([
                { id: 'developer', label: '$(folder) Xcode developer directory', description: profile.appleDeveloperDirectory || report.developerDirectory || 'automatic' },
                { id: 'bundle', label: '$(symbol-namespace) Bundle identifier', description: appleBundleIdentifier(profile, context.manifest) },
                { id: 'target', label: '$(versions) Deployment target', description: profile.appleDeploymentTarget || 'Qt default' },
                { id: 'arch', label: '$(circuit-board) Architectures', description: profile.appleArchitectures.join(', ') },
                { id: 'team', label: '$(organization) Development team', description: profile.appleDevelopmentTeam || 'not configured' },
                { id: 'identity', label: '$(verified-filled) Code-sign identity', description: profile.appleCodeSignIdentity || 'ad-hoc / automatic' },
                { id: 'entitlements', label: '$(shield) Entitlements file', description: profile.appleEntitlementsFile || 'none' },
                { id: 'simulator', label: '$(device-mobile) iOS simulator', description: profile.appleSimulatorId || 'automatic' },
                { id: 'notary', label: '$(cloud-upload) Notarytool keychain profile', description: profile.appleNotaryProfile || 'not configured' },
                { id: 'tools', label: '$(tools) Tool overrides', description: 'xcodebuild, xcrun and macdeployqt' },
                { id: 'report', label: '$(report) Open Apple environment report', description: report.summary },
                { id: 'done', label: '$(check-all) Done', description: 'Save and close' }
            ], { title: `Apple environment — ${context.manifest.name}` });
            if (!action || action.id === 'done')
                break;
            if (action.id === 'developer') {
                const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title: 'Select Xcode developer directory', defaultUri: profile.appleDeveloperDirectory ? vscode.Uri.file(profile.appleDeveloperDirectory) : undefined });
                if (selected?.[0])
                    profile.appleDeveloperDirectory = selected[0].fsPath;
            }
            else if (action.id === 'bundle') {
                const value = await vscode.window.showInputBox({ title: 'Apple bundle identifier', value: appleBundleIdentifier(profile, context.manifest), validateInput: validateBundleIdentifier });
                if (value !== undefined)
                    profile.appleBundleIdentifier = value.trim();
            }
            else if (action.id === 'target') {
                const value = await vscode.window.showInputBox({ title: 'Apple deployment target', prompt: 'Leave empty to use the minimum supported by the selected Qt kit.', value: profile.appleDeploymentTarget });
                if (value !== undefined)
                    profile.appleDeploymentTarget = value.trim();
            }
            else if (action.id === 'arch') {
                const selected = await vscode.window.showQuickPick([
                    { label: 'arm64', value: 'arm64', picked: profile.appleArchitectures.includes('arm64') },
                    { label: 'x86_64', value: 'x86_64', picked: profile.appleArchitectures.includes('x86_64') }
                ], { title: 'Apple architectures', canPickMany: true });
                if (selected?.length)
                    profile.appleArchitectures = selected.map((entry) => entry.value);
            }
            else if (action.id === 'team') {
                const value = await vscode.window.showInputBox({ title: 'Apple development team ID', value: profile.appleDevelopmentTeam });
                if (value !== undefined)
                    profile.appleDevelopmentTeam = value.trim();
            }
            else if (action.id === 'identity') {
                const identities = report.tools.security ? listCodeSigningIdentities(report.tools.security, createAppleEnvironment(profile)) : [];
                const selected = await vscode.window.showQuickPick([
                    { label: 'Automatic / ad-hoc signing', value: '' },
                    ...identities.map((identity) => ({ label: identity, value: identity })),
                    { label: 'Enter another identity…', value: '__custom__' }
                ], { title: 'Code-sign identity' });
                if (selected?.value === '__custom__') {
                    const value = await vscode.window.showInputBox({ title: 'Code-sign identity', value: profile.appleCodeSignIdentity });
                    if (value !== undefined)
                        profile.appleCodeSignIdentity = value.trim();
                }
                else if (selected)
                    profile.appleCodeSignIdentity = selected.value;
            }
            else if (action.id === 'entitlements') {
                const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, title: 'Select Apple entitlements file', filters: { 'Apple entitlements': ['entitlements', 'plist'] }, defaultUri: profile.appleEntitlementsFile ? vscode.Uri.file(resolveProjectPath(context.root, profile.appleEntitlementsFile)) : undefined });
                if (selected?.[0])
                    profile.appleEntitlementsFile = projectRelativePath(context.root, selected[0].fsPath);
            }
            else if (action.id === 'simulator') {
                await this.selectSimulator(profile, context.manifestPath, context.manifest);
            }
            else if (action.id === 'notary') {
                const value = await vscode.window.showInputBox({ title: 'notarytool keychain profile', prompt: 'Create it beforehand with xcrun notarytool store-credentials.', value: profile.appleNotaryProfile });
                if (value !== undefined)
                    profile.appleNotaryProfile = value.trim();
            }
            else if (action.id === 'tools') {
                const tool = await vscode.window.showQuickPick([
                    { id: 'xcodebuild', label: 'xcodebuild executable', description: profile.appleXcodebuildPath || report.tools.xcodebuild || 'automatic' },
                    { id: 'xcrun', label: 'xcrun executable', description: profile.appleXcrunPath || report.tools.xcrun || 'automatic' },
                    { id: 'macdeployqt', label: 'macdeployqt executable', description: profile.appleMacDeployQtPath || report.tools.macdeployqt || 'automatic' }
                ], { title: 'Apple tool override' });
                if (tool) {
                    const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, title: `Select ${tool.label}` });
                    if (selected?.[0]) {
                        if (tool.id === 'xcodebuild')
                            profile.appleXcodebuildPath = selected[0].fsPath;
                        else if (tool.id === 'xcrun')
                            profile.appleXcrunPath = selected[0].fsPath;
                        else
                            profile.appleMacDeployQtPath = selected[0].fsPath;
                    }
                }
            }
            else if (action.id === 'report')
                await this.openReport();
            (0, qtProjectManifest_1.writeQtProjectManifest)(context.manifestPath, context.manifest);
            this.workspaces.refresh();
            this.changed.fire();
        }
        (0, qtProjectManifest_1.writeQtProjectManifest)(context.manifestPath, context.manifest);
        this.workspaces.refresh();
        this.changed.fire();
    }
    listSimulators() {
        const context = this.readManifestContext(false);
        const profile = context?.platform;
        const xcrun = firstExisting([profile?.appleXcrunPath, '/usr/bin/xcrun', findOnPath('xcrun')]);
        return xcrun ? this.listSimulatorsWithTool(xcrun, profile) : [];
    }
    async selectSimulator(profile, manifestPath, manifest) {
        const context = manifestPath && manifest && profile
            ? { manifestPath, manifest, platform: profile, root: path.dirname(manifestPath) }
            : this.readManifestContext();
        if (!context)
            return undefined;
        const simulators = this.detectEnvironment(context.platform).simulators;
        if (!simulators.length) {
            vscode.window.showWarningMessage('No available iOS simulator was detected. Install an iOS simulator runtime in Xcode.');
            return undefined;
        }
        const selected = await vscode.window.showQuickPick(simulators.map((entry) => ({
            label: entry.name,
            description: `${entry.runtime} · ${entry.state}`,
            detail: entry.udid,
            simulator: entry,
            picked: entry.udid === context.platform.appleSimulatorId
        })), { title: 'Select iOS simulator' });
        if (!selected)
            return undefined;
        context.platform.appleSimulatorId = selected.simulator.udid;
        (0, qtProjectManifest_1.writeQtProjectManifest)(context.manifestPath, context.manifest);
        this.workspaces.refresh();
        this.changed.fire();
        return selected.simulator;
    }
    async bootSimulator() {
        const context = this.createContext();
        if (context.platform.type !== 'ios-simulator')
            throw new Error('Select an iOS Simulator platform profile first.');
        const report = this.detectEnvironment(context.platform);
        const xcrun = report.tools.xcrun;
        if (!xcrun)
            throw new Error('xcrun was not found.');
        const simulator = await this.ensureSimulator(context);
        if (!simulator)
            return false;
        this.begin(`Boot iOS simulator ${simulator.name}`);
        const booted = simulator.state.toLowerCase() === 'booted' || await this.run(xcrun, ['simctl', 'boot', simulator.udid], context.root, context.environment, 'Boot simulator', true);
        if (!booted)
            return false;
        await this.run(xcrun, ['simctl', 'bootstatus', simulator.udid, '-b'], context.root, context.environment, 'Wait for simulator boot', true);
        const open = firstExisting(['/usr/bin/open', findOnPath('open')]);
        if (open)
            await this.run(open, ['-a', 'Simulator'], context.root, context.environment, 'Open Simulator application', true);
        this.changed.fire();
        return true;
    }
    async buildActive() {
        const context = this.createContext();
        if (context.platform.type === 'macos') {
            this.begin(`Build macOS target ${context.manifest.name}`);
            const ok = await this.builds.build(false);
            if (ok)
                this.latestArtifactValue = findLatestBundle(context.root, context.manifest.targetName, context.buildDirectory) || this.latestArtifactValue;
            this.changed.fire();
            return ok;
        }
        return this.buildIos(context);
    }
    async deployMacApplication(createDmg) {
        const context = this.createContext();
        if (context.platform.type !== 'macos')
            throw new Error('Select a macOS platform profile first.');
        const report = this.detectEnvironment(context.platform);
        const macdeployqt = report.tools.macdeployqt;
        if (!macdeployqt)
            throw new Error('macdeployqt was not found in the selected Qt kit.');
        let appBundle = findLatestBundle(context.root, context.manifest.targetName, context.buildDirectory);
        if (!appBundle) {
            const built = await this.builds.build(false);
            if (!built)
                return false;
            appBundle = findLatestBundle(context.root, context.manifest.targetName, context.buildDirectory);
        }
        if (!appBundle)
            throw new Error(`Unable to locate ${context.manifest.targetName}.app after the build.`);
        const profile = context.platform;
        const args = [path.basename(appBundle), '-verbose=2'];
        const qmlDirs = projectQmlDirectories(context.root, context.manifest);
        for (const directory of qmlDirs)
            args.push(`-qmldir=${directory}`);
        if (profile.appleAppStoreCompliant)
            args.push('-appstore-compliant');
        if (profile.appleCodeSignIdentity) {
            if (profile.appleHardenedRuntime && profile.appleTimestamp)
                args.push(`-sign-for-notarization=${profile.appleCodeSignIdentity}`);
            else {
                args.push(`-codesign=${profile.appleCodeSignIdentity}`);
                if (profile.appleHardenedRuntime)
                    args.push('-hardened-runtime');
                if (profile.appleTimestamp)
                    args.push('-timestamp');
            }
        }
        else
            args.push('-codesign=-');
        const shouldCreateDmg = createDmg ?? profile.appleCreateDmg;
        if (shouldCreateDmg) {
            args.push('-dmg');
            args.push(`-fs=${profile.appleDmgFileSystem}`);
        }
        args.push(...profile.appleAdditionalMacDeployQtArguments);
        this.begin(`Deploy macOS application ${path.basename(appBundle)}`);
        const success = await this.run(macdeployqt, args, path.dirname(appBundle), context.environment, shouldCreateDmg ? 'Deploy Qt runtime and create DMG' : 'Deploy Qt runtime');
        if (success) {
            const dmg = path.join(path.dirname(appBundle), `${path.basename(appBundle, '.app')}.dmg`);
            this.latestArtifactValue = shouldCreateDmg && fs.existsSync(dmg) ? dmg : appBundle;
        }
        this.changed.fire();
        return success;
    }
    async signArtifacts() {
        const context = this.createContext();
        const report = this.detectEnvironment(context.platform);
        const codesign = report.tools.codesign;
        if (!codesign)
            throw new Error('codesign was not found.');
        if (!context.platform.appleCodeSignIdentity)
            throw new Error('Configure a code-sign identity first.');
        const artifact = await this.resolveArtifact(context, ['app', 'dmg', 'pkg']);
        if (!artifact)
            return false;
        const args = ['--force', '--sign', context.platform.appleCodeSignIdentity];
        if (context.platform.appleHardenedRuntime)
            args.push('--options', 'runtime');
        if (context.platform.appleTimestamp)
            args.push('--timestamp');
        if (context.platform.appleEntitlementsFile)
            args.push('--entitlements', resolveProjectPath(context.root, context.platform.appleEntitlementsFile));
        args.push(artifact);
        this.begin(`Sign ${path.basename(artifact)}`);
        const success = await this.run(codesign, args, context.root, context.environment, 'Code sign Apple artifact');
        if (success)
            this.latestArtifactValue = artifact;
        return success;
    }
    async verifySignatures() {
        const context = this.createContext();
        const report = this.detectEnvironment(context.platform);
        const codesign = report.tools.codesign;
        if (!codesign)
            throw new Error('codesign was not found.');
        const artifact = await this.resolveArtifact(context, ['app', 'dmg', 'pkg']);
        if (!artifact)
            return false;
        this.begin(`Verify ${path.basename(artifact)}`);
        let success = await this.run(codesign, ['--verify', '--deep', '--strict', '--verbose=2', artifact], context.root, context.environment, 'Verify code signature');
        if (success && report.tools.spctl && artifact.toLowerCase().endsWith('.app')) {
            success = await this.run(report.tools.spctl, ['--assess', '--type', 'execute', '--verbose=4', artifact], context.root, context.environment, 'Assess Gatekeeper acceptance', true) && success;
        }
        return success;
    }
    async notarizeArtifact() {
        const context = this.createContext();
        if (!context.platform.appleNotaryProfile)
            throw new Error('Configure a notarytool keychain profile first.');
        const report = this.detectEnvironment(context.platform);
        const xcrun = report.tools.xcrun;
        if (!xcrun)
            throw new Error('xcrun was not found.');
        const artifact = await this.resolveArtifact(context, ['dmg', 'pkg', 'zip']);
        if (!artifact)
            return false;
        this.begin(`Notarize ${path.basename(artifact)}`);
        const success = await this.run(xcrun, ['notarytool', 'submit', artifact, '--keychain-profile', context.platform.appleNotaryProfile, '--wait'], context.root, context.environment, 'Submit artifact to Apple notary service');
        if (!success)
            return false;
        this.latestArtifactValue = artifact;
        if (context.platform.appleStapleAfterNotarization)
            return this.stapleArtifact(artifact);
        return true;
    }
    async stapleArtifact(artifactOverride) {
        const context = this.createContext();
        const report = this.detectEnvironment(context.platform);
        const xcrun = report.tools.xcrun;
        if (!xcrun)
            throw new Error('xcrun was not found.');
        const artifact = artifactOverride || await this.resolveArtifact(context, ['app', 'dmg', 'pkg']);
        if (!artifact)
            return false;
        this.begin(`Staple notarization ticket to ${path.basename(artifact)}`);
        const success = await this.run(xcrun, ['stapler', 'staple', artifact], context.root, context.environment, 'Staple notarization ticket');
        if (success)
            this.latestArtifactValue = artifact;
        return success;
    }
    async installAndRunIosSimulator() {
        const context = this.createContext();
        if (context.platform.type !== 'ios-simulator')
            throw new Error('Select an iOS Simulator platform profile first.');
        const report = this.detectEnvironment(context.platform);
        const xcrun = report.tools.xcrun;
        if (!xcrun)
            throw new Error('xcrun was not found.');
        const simulator = await this.ensureSimulator(context);
        if (!simulator)
            return false;
        if (simulator.state.toLowerCase() !== 'booted' && !await this.bootSimulator())
            return false;
        let appBundle = findLatestBundle(context.buildDirectory, context.manifest.targetName, context.root);
        if (!appBundle) {
            if (!await this.buildIos(context))
                return false;
            appBundle = findLatestBundle(context.buildDirectory, context.manifest.targetName, context.root);
        }
        if (!appBundle)
            throw new Error(`Unable to locate ${context.manifest.targetName}.app in the iOS build output.`);
        const bundleId = appleBundleIdentifier(context.platform, context.manifest);
        this.begin(`Install and run ${path.basename(appBundle)} on ${simulator.name}`);
        if (!await this.run(xcrun, ['simctl', 'install', simulator.udid, appBundle], context.root, context.environment, 'Install application in simulator'))
            return false;
        const success = await this.run(xcrun, ['simctl', 'launch', simulator.udid, bundleId], context.root, context.environment, 'Launch application in simulator');
        if (success)
            this.latestArtifactValue = appBundle;
        return success;
    }
    async openReport() {
        const context = this.readManifestContext(false);
        const report = this.detectEnvironment(context?.platform);
        const profile = context?.platform;
        const lines = [
            '# Qt Apple Platforms Report', '',
            `- Status: ${report.ready ? 'Ready' : 'Needs configuration'}`,
            `- Platform: ${applePlatformLabel(report.platform)}`,
            `- Host: ${process.platform} (${report.hostSupported ? 'supported' : 'Apple workflows unavailable'})`,
            `- Qt: ${report.qtRoot || 'not found'}`,
            `- Xcode developer directory: ${report.developerDirectory || 'not found'}`,
            `- Xcode: ${report.xcodeVersion || 'not found'}`,
            `- Bundle identifier: ${profile && context ? appleBundleIdentifier(profile, context.manifest) : 'not configured'}`,
            `- Development team: ${profile?.appleDevelopmentTeam || 'not configured'}`,
            `- Code-sign identity: ${profile?.appleCodeSignIdentity || 'automatic / ad-hoc'}`,
            `- Notary profile: ${profile?.appleNotaryProfile || 'not configured'}`, '',
            '## Tools', '',
            ...Object.entries(report.tools).map(([name, value]) => `- ${name}: ${value || 'not found'}`), '',
            '## iOS Simulators', '',
            ...(report.simulators.length ? report.simulators.map((entry) => `- ${entry.name} — ${entry.runtime} — ${entry.state} — ${entry.udid}`) : ['- No simulator detected']), '',
            '## Diagnostics', '',
            ...report.details.map((detail) => `- ${detail}`)
        ];
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
        await vscode.window.showTextDocument(document, { preview: true });
    }
    async revealOutput() {
        const context = this.readManifestContext();
        if (!context)
            return;
        const candidate = this.latestArtifactValue || findLatestBundle(context.root, context.manifest.targetName, this.appleBuildDirectory(context.manifestPath, context.manifest, context.platform)) || this.appleBuildDirectory(context.manifestPath, context.manifest, context.platform);
        if (fs.existsSync(candidate))
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(candidate));
        else
            vscode.window.showWarningMessage('No Apple build or package output exists yet.');
    }
    async cleanOutput() {
        const context = this.readManifestContext();
        if (!context)
            return;
        const build = this.appleBuildDirectory(context.manifestPath, context.manifest, context.platform);
        const generated = path.join(context.root, '.qpm', 'apple');
        for (const directory of [build, generated]) {
            if (fs.existsSync(directory))
                fs.rmSync(directory, { recursive: true, force: true });
        }
        this.latestArtifactValue = '';
        this.changed.fire();
        vscode.window.showInformationMessage('Apple build and deployment output cleaned.');
    }
    readManifestContext(notify = true) {
        const ref = this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            if (notify)
                vscode.window.showErrorMessage('Open a native Qt project first.');
            return undefined;
        }
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
        const platform = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(manifest);
        if (!isApplePlatform(platform.type)) {
            if (notify)
                vscode.window.showErrorMessage('Select a macOS, iOS Simulator or iOS Device platform profile first.');
            return undefined;
        }
        return { manifestPath: ref.absolutePath, manifest, platform, root: path.dirname(ref.absolutePath) };
    }
    createContext() {
        const current = this.readManifestContext();
        if (!current)
            throw new Error('No active Apple Qt project.');
        const qt = this.resolveQtInstallation(current.manifest);
        const buildDirectory = this.appleBuildDirectory(current.manifestPath, current.manifest, current.platform);
        const generatedProjectDirectory = path.join(current.root, '.qpm', 'apple', 'generated', current.platform.id);
        return {
            ...current,
            qt,
            environment: createAppleEnvironment(current.platform, qt),
            buildDirectory,
            generatedProjectDirectory
        };
    }
    resolveQtInstallation(manifest) {
        return this.qtInstallations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest, (0, qtProjectManifest_1.getPersistedQtBuildMode)(manifest)));
    }
    appleBuildDirectory(manifestPath, manifest, platform) {
        const root = path.dirname(manifestPath);
        const build = (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, (0, qtProjectManifest_1.getPersistedQtBuildMode)(manifest));
        const variant = (0, qtProjectManifest_1.isReleaseBuildMode)((0, qtProjectManifest_1.getPersistedQtBuildMode)(manifest)) ? 'release' : 'debug';
        return path.resolve(root, build.outputDirectory, variant, 'apple', platform.type, platform.id);
    }
    async buildIos(context) {
        if (context.platform.type !== 'ios-simulator' && context.platform.type !== 'ios-device')
            throw new Error('Select an iOS platform profile first.');
        const report = this.detectEnvironment(context.platform);
        if (!report.hostSupported)
            throw new Error('iOS builds require macOS.');
        const qtCMake = report.tools['qt-cmake'];
        const xcodebuild = report.tools.xcodebuild;
        if (!qtCMake || !xcodebuild)
            throw new Error('qt-cmake and xcodebuild are required for the iOS workflow.');
        fs.mkdirSync(context.generatedProjectDirectory, { recursive: true });
        fs.mkdirSync(context.buildDirectory, { recursive: true });
        const projectFile = path.join(context.generatedProjectDirectory, 'CMakeLists.txt');
        fs.writeFileSync(projectFile, generateAppleCMakeProject(context), 'utf8');
        const configureArgs = [
            '-S', context.generatedProjectDirectory,
            '-B', context.buildDirectory,
            '-G', 'Xcode',
            `-DCMAKE_BUILD_TYPE=${context.platform.appleConfiguration}`,
            `-DCMAKE_OSX_ARCHITECTURES=${context.platform.appleArchitectures.join(';')}`,
            ...(context.platform.appleDeploymentTarget ? [`-DCMAKE_OSX_DEPLOYMENT_TARGET=${context.platform.appleDeploymentTarget}`] : []),
            ...context.platform.appleAdditionalCMakeArguments
        ];
        this.begin(`Configure ${context.manifest.name} for ${applePlatformLabel(context.platform.type)}`);
        if (!await this.run(qtCMake, configureArgs, context.root, context.environment, 'Configure Xcode project with qt-cmake'))
            return false;
        const xcodeProject = findFirstFile(context.buildDirectory, '.xcodeproj');
        if (!xcodeProject)
            throw new Error('qt-cmake did not generate an Xcode project.');
        const scheme = context.platform.appleScheme || context.manifest.targetName;
        const destination = context.platform.type === 'ios-simulator'
            ? (context.platform.appleSimulatorId ? `platform=iOS Simulator,id=${context.platform.appleSimulatorId}` : 'generic/platform=iOS Simulator')
            : (context.platform.appleDeviceId ? `platform=iOS,id=${context.platform.appleDeviceId}` : 'generic/platform=iOS');
        const args = [
            'build',
            '-project', xcodeProject,
            '-scheme', scheme,
            '-configuration', context.platform.appleConfiguration,
            '-destination', destination,
            '-destination-timeout', '30',
            'ENABLE_ONLY_ACTIVE_RESOURCES=NO',
            ...(context.platform.appleDevelopmentTeam ? [`DEVELOPMENT_TEAM=${context.platform.appleDevelopmentTeam}`] : []),
            ...(context.platform.appleAutomaticSigning ? ['CODE_SIGN_STYLE=Automatic'] : ['CODE_SIGN_STYLE=Manual']),
            ...(context.platform.appleProvisioningProfile ? [`PROVISIONING_PROFILE_SPECIFIER=${context.platform.appleProvisioningProfile}`] : []),
            ...(context.platform.appleCodeSignIdentity ? [`CODE_SIGN_IDENTITY=${context.platform.appleCodeSignIdentity}`] : []),
            ...(context.platform.appleAllowProvisioningUpdates ? ['-allowProvisioningUpdates'] : []),
            ...context.platform.appleAdditionalXcodebuildArguments
        ];
        const success = await this.run(xcodebuild, args, context.buildDirectory, context.environment, 'Build Xcode project');
        if (success)
            this.latestArtifactValue = findLatestBundle(context.buildDirectory, context.manifest.targetName, context.root) || context.buildDirectory;
        this.changed.fire();
        return success;
    }
    listSimulatorsWithTool(xcrun, profile) {
        try {
            const output = (0, child_process_1.execFileSync)(xcrun, ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8', timeout: 10000, env: createAppleEnvironment(profile), windowsHide: true });
            return parseSimctlDevices(output);
        }
        catch {
            return [];
        }
    }
    async ensureSimulator(context) {
        const simulators = this.detectEnvironment(context.platform).simulators;
        const configured = context.platform.appleSimulatorId;
        if (configured) {
            const match = simulators.find((entry) => entry.udid === configured);
            if (match)
                return match;
        }
        const booted = simulators.find((entry) => entry.state.toLowerCase() === 'booted');
        if (booted) {
            context.platform.appleSimulatorId = booted.udid;
            (0, qtProjectManifest_1.writeQtProjectManifest)(context.manifestPath, context.manifest);
            return booted;
        }
        if (simulators.length === 1) {
            context.platform.appleSimulatorId = simulators[0].udid;
            (0, qtProjectManifest_1.writeQtProjectManifest)(context.manifestPath, context.manifest);
            return simulators[0];
        }
        return this.selectSimulator(context.platform, context.manifestPath, context.manifest);
    }
    async resolveArtifact(context, extensions) {
        const candidates = [
            this.latestArtifactValue,
            findLatestArtifact(context.buildDirectory, extensions),
            findLatestArtifact(context.root, extensions)
        ].filter((entry) => !!entry && fs.existsSync(entry));
        if (candidates.length)
            return candidates[0];
        const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, title: 'Select Apple artifact' });
        return selected?.[0]?.fsPath;
    }
    begin(label) {
        this.output.clear();
        this.output.show(true);
        this.output.appendLine(`[Qt Apple] ${label}`);
        this.output.appendLine('');
    }
    run(executable, args, cwd, env, label, allowFailure = false) {
        this.output.appendLine(`[Qt Apple] ${label}`);
        this.output.appendLine(`[Qt Apple] Tool: ${executable}`);
        this.output.appendLine(`[Qt Apple] Arguments: ${args.map(quoteForLog).join(' ')}`);
        return new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(executable, args, { cwd, env, windowsHide: true });
            child.stdout.on('data', (data) => this.output.append(data.toString()));
            child.stderr.on('data', (data) => this.output.append(data.toString()));
            child.on('error', (error) => {
                this.output.appendLine(`[Qt Apple] Unable to start ${executable}: ${error.message}`);
                resolve(false);
            });
            child.on('close', (code) => {
                this.output.appendLine(`[Qt Apple] ${path.basename(executable)} exited with code ${String(code)}.`);
                resolve(code === 0 || allowFailure);
            });
        });
    }
}
exports.QpmQtAppleService = QpmQtAppleService;
function isApplePlatform(value) {
    return value === 'macos' || value === 'ios-simulator' || value === 'ios-device';
}
function applePlatformLabel(value) {
    return value === 'macos' ? 'macOS' : value === 'ios-simulator' ? 'iOS Simulator' : value === 'ios-device' ? 'iOS Device' : 'Apple platform';
}
function parseSimctlDevices(output) {
    try {
        const parsed = JSON.parse(output);
        const result = [];
        for (const [runtimeKey, devices] of Object.entries(parsed.devices ?? {})) {
            const runtime = runtimeKey.replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, '').replace(/-/g, ' ');
            for (const device of devices ?? []) {
                const udid = typeof device.udid === 'string' ? device.udid : '';
                const name = typeof device.name === 'string' ? device.name : 'iOS Simulator';
                const state = typeof device.state === 'string' ? device.state : 'Unknown';
                const available = device.isAvailable !== false && !String(device.availabilityError ?? '').trim();
                if (udid && available)
                    result.push({ udid, name, state, runtime, available });
            }
        }
        return result.sort((a, b) => Number(b.state === 'Booted') - Number(a.state === 'Booted') || b.runtime.localeCompare(a.runtime) || a.name.localeCompare(b.name));
    }
    catch {
        return [];
    }
}
function generateAppleCMakeProject(context) {
    const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(context.manifestPath || path.join(context.root, `${context.manifest.name}.qtproject.json`), context.manifest);
    const sourceFiles = [...files.sources, ...files.headers, ...files.forms, ...files.resources].map(cmakePath);
    const qmlFiles = files.qml.map(cmakePath);
    const resolvedManifestPath = context.manifestPath || path.join(context.root, `${context.manifest.name}.qtproject.json`);
    const inferredModules = (0, qpmQtModuleInference_1.effectiveQtModules)(resolvedManifestPath, context.manifest).modules;
    const modules = [...new Set(inferredModules.length ? inferredModules : ['Core', 'Gui'])];
    const bundleId = appleBundleIdentifier(context.platform, context.manifest);
    const target = cmakeIdentifier(context.manifest.targetName);
    const lines = [
        '# Generated by Qt Project Manager — Apple platform backend',
        'cmake_minimum_required(VERSION 3.21.1)',
        `project(${cmakeIdentifier(context.manifest.name)} LANGUAGES CXX OBJCXX)`,
        'set(CMAKE_AUTOMOC ON)',
        'set(CMAKE_AUTOUIC ON)',
        'set(CMAKE_AUTORCC ON)',
        `set(CMAKE_CXX_STANDARD ${context.manifest.build.cppStandard.replace('c++', '') || '17'})`,
        'set(CMAKE_CXX_STANDARD_REQUIRED ON)',
        `find_package(Qt6 REQUIRED COMPONENTS ${modules.join(' ')})`,
        'qt_standard_project_setup()',
        `qt_add_executable(${target} MACOSX_BUNDLE`,
        ...sourceFiles.map((file) => `  ${cmakeQuote(file)}`),
        ')',
        `target_link_libraries(${target} PRIVATE ${modules.map((module) => `Qt6::${module}`).join(' ')})`,
        ...(qmlFiles.length ? [
            `qt_add_qml_module(${target}`,
            `  URI ${cmakeQuote(context.manifest.qml.module.uri)}`,
            `  VERSION ${context.manifest.qml.module.version}`,
            `  RESOURCE_PREFIX ${cmakeQuote(context.manifest.qml.module.resourcePrefix)}`,
            '  QML_FILES',
            ...qmlFiles.map((file) => `    ${cmakeQuote(file)}`),
            ')'
        ] : []),
        `set_target_properties(${target} PROPERTIES`,
        `  MACOSX_BUNDLE_GUI_IDENTIFIER ${cmakeQuote(bundleId)}`,
        `  MACOSX_BUNDLE_BUNDLE_NAME ${cmakeQuote(context.manifest.packaging.productName || context.manifest.name)}`,
        `  MACOSX_BUNDLE_BUNDLE_VERSION ${cmakeQuote(context.manifest.packaging.productVersion || '1.0.0')}`,
        `  MACOSX_BUNDLE_SHORT_VERSION_STRING ${cmakeQuote(context.manifest.packaging.productVersion || '1.0.0')}`,
        ')',
        ...(context.platform.appleDevelopmentTeam ? [`set_property(TARGET ${target} PROPERTY XCODE_ATTRIBUTE_DEVELOPMENT_TEAM ${cmakeQuote(context.platform.appleDevelopmentTeam)})`] : []),
        ...(context.platform.appleEntitlementsFile ? [`set_property(TARGET ${target} PROPERTY XCODE_ATTRIBUTE_CODE_SIGN_ENTITLEMENTS ${cmakeQuote(resolveProjectPath(context.root, context.platform.appleEntitlementsFile))})`] : []),
        ...(context.platform.appleProvisioningProfile ? [`set_property(TARGET ${target} PROPERTY XCODE_ATTRIBUTE_PROVISIONING_PROFILE_SPECIFIER ${cmakeQuote(context.platform.appleProvisioningProfile)})`] : []),
        ''
    ];
    return lines.join('\n');
}
function appleBundleIdentifier(profile, manifest) {
    return profile.appleBundleIdentifier.trim() || manifest.packaging.identifier.trim() || `org.qtproject.example.${manifest.targetName.replace(/[^A-Za-z0-9.-]+/g, '-')}`;
}
function validateBundleIdentifier(value) {
    const text = value.trim();
    if (!text)
        return 'A bundle identifier is required.';
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$/.test(text) || !text.includes('.'))
        return 'Use a reverse-domain identifier such as com.company.application.';
    return undefined;
}
function resolveDeveloperDirectory(profile) {
    if (profile?.appleDeveloperDirectory && isDirectory(profile.appleDeveloperDirectory))
        return profile.appleDeveloperDirectory;
    if (process.env.DEVELOPER_DIR && isDirectory(process.env.DEVELOPER_DIR))
        return process.env.DEVELOPER_DIR;
    const xcodeSelect = firstExisting(['/usr/bin/xcode-select', findOnPath('xcode-select')]);
    if (!xcodeSelect)
        return undefined;
    const result = safeExec(xcodeSelect, ['-print-path'], process.env).trim();
    return result && isDirectory(result) ? result : undefined;
}
function resolveWithXcrun(profile, tool) {
    const xcrun = firstExisting([profile?.appleXcrunPath, '/usr/bin/xcrun', findOnPath('xcrun')]);
    if (!xcrun || process.platform !== 'darwin')
        return undefined;
    const result = safeExec(xcrun, ['--find', tool], createAppleEnvironment(profile)).trim();
    return result && isFile(result) ? result : undefined;
}
function createAppleEnvironment(profile, qt) {
    const env = { ...process.env };
    const developerDirectory = resolveDeveloperDirectory(profile);
    if (developerDirectory)
        env.DEVELOPER_DIR = developerDirectory;
    const paths = [qt?.binDir, path.dirname(profile?.appleXcodebuildPath || ''), path.dirname(profile?.appleXcrunPath || ''), env.PATH].filter(Boolean);
    env.PATH = paths.join(path.delimiter);
    return env;
}
function listCodeSigningIdentities(security, env) {
    const output = safeExec(security, ['find-identity', '-v', '-p', 'codesigning'], env);
    return output.split(/\r?\n/).map((line) => line.match(/"([^"]+)"/)?.[1] || '').filter(Boolean);
}
function safeExec(executable, args, env) {
    try {
        return (0, child_process_1.execFileSync)(executable, args, { encoding: 'utf8', env, timeout: 10000, windowsHide: true });
    }
    catch {
        return '';
    }
}
function findOnPath(name) {
    const pathValue = process.env.PATH || '';
    for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
        const candidate = path.join(directory, name);
        if (isFile(candidate))
            return candidate;
    }
    return undefined;
}
function resolveExecutable(configured, fallback) {
    const text = configured.trim();
    if (text && isFile(text))
        return text;
    return findOnPath(text || fallback);
}
function firstExisting(values) {
    for (const value of values)
        if (value && isFile(value))
            return value;
    return undefined;
}
function isFile(candidate) {
    if (!candidate)
        return false;
    try {
        return fs.statSync(candidate).isFile();
    }
    catch {
        return false;
    }
}
function isDirectory(candidate) {
    if (!candidate)
        return false;
    try {
        return fs.statSync(candidate).isDirectory();
    }
    catch {
        return false;
    }
}
function projectQmlDirectories(root, manifest) {
    const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(path.join(root, `${manifest.name}.qtproject.json`), manifest).qml;
    return [...new Set(files.map((file) => path.dirname(file)).filter(isDirectory))];
}
function findLatestBundle(primaryRoot, targetName, fallbackRoot) {
    const matches = [...findFiles(primaryRoot, (entry) => entry.toLowerCase().endsWith('.app'), 6), ...findFiles(fallbackRoot, (entry) => entry.toLowerCase().endsWith('.app'), 4)];
    const exact = matches.filter((entry) => path.basename(entry, '.app').toLowerCase() === targetName.toLowerCase());
    return newestPath(exact.length ? exact : matches);
}
function findLatestArtifact(root, extensions) {
    const normalized = extensions.map((entry) => `.${entry.toLowerCase().replace(/^\./, '')}`);
    return newestPath(findFiles(root, (entry) => normalized.some((extension) => entry.toLowerCase().endsWith(extension)), 6));
}
function findFirstFile(root, suffix) {
    return findFiles(root, (entry) => entry.toLowerCase().endsWith(suffix.toLowerCase()), 4)[0];
}
function findFiles(root, predicate, depth) {
    if (depth < 0 || !isDirectory(root))
        return [];
    const result = [];
    let entries = [];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    }
    catch {
        return result;
    }
    for (const entry of entries) {
        const absolute = path.join(root, entry.name);
        if (predicate(absolute))
            result.push(absolute);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
            result.push(...findFiles(absolute, predicate, depth - 1));
    }
    return result;
}
function newestPath(entries) {
    return entries.filter((entry) => fs.existsSync(entry)).sort((a, b) => safeMtime(b) - safeMtime(a))[0];
}
function safeMtime(file) {
    try {
        return fs.statSync(file).mtimeMs;
    }
    catch {
        return 0;
    }
}
function projectRelativePath(root, target) {
    const relative = path.relative(root, target);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative.replace(/\\/g, '/') : target;
}
function resolveProjectPath(root, candidate) {
    return path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
}
function cmakePath(value) { return value.replace(/\\/g, '/'); }
function cmakeQuote(value) { return `"${value.replace(/\\/g, '/').replace(/"/g, '\\"')}"`; }
function cmakeIdentifier(value) { return value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^([0-9])/, '_$1') || 'QtApplication'; }
function quoteForLog(value) { return /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value; }
