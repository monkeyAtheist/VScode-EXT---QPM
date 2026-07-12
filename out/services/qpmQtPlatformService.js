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
exports.QpmQtPlatformService = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtAppleService_1 = require("./qpmQtAppleService");
class QpmQtPlatformService {
    workspaces;
    builds;
    output;
    android;
    apple;
    changed = new vscode.EventEmitter();
    onDidChange = this.changed.event;
    disposables = [];
    wasmServer;
    wasmServerDescription = '';
    constructor(workspaces, builds, output, android, apple) {
        this.workspaces = workspaces;
        this.builds = builds;
        this.output = output;
        this.android = android;
        this.apple = apple;
        this.disposables.push(workspaces.onDidChange(() => this.changed.fire()));
    }
    dispose() {
        this.stopWebAssemblyServer(false);
        for (const disposable of this.disposables)
            disposable.dispose();
        this.changed.dispose();
    }
    get activeProfile() {
        const ref = this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return undefined;
        try {
            return (0, qtProjectManifest_1.getActiveQtPlatformProfile)((0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath));
        }
        catch {
            return undefined;
        }
    }
    get activeServerDescription() { return this.wasmServerDescription; }
    async manageProfiles() {
        const context = this.readContext();
        if (!context)
            return;
        while (true) {
            const active = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(context.manifest);
            const action = await vscode.window.showQuickPick([
                { id: 'select', label: '$(check) Select active platform', description: `${active.name} · ${platformLabel(active.type)}` },
                { id: 'create', label: '$(add) Create platform profile', description: 'Desktop, Linux, Android, Apple, Docker or WebAssembly' },
                { id: 'edit', label: '$(edit) Edit active platform', description: active.name },
                { id: 'duplicate', label: '$(copy) Duplicate active platform', description: 'Create a reusable variant' },
                { id: 'delete', label: '$(trash) Delete active platform', description: context.manifest.profiles.platforms.length > 1 ? active.name : 'At least one profile is required' },
                { id: 'report', label: '$(pulse) Platform capabilities report', description: 'Inspect required tools and configuration' },
                { id: 'done', label: '$(check-all) Done', description: 'Close the platform manager' }
            ], { title: `Qt Platforms — ${context.manifest.name}` });
            if (!action || action.id === 'done')
                return;
            if (action.id === 'select')
                await this.selectActivePlatform(context.manifestPath, context.manifest);
            else if (action.id === 'create')
                await this.createProfile(context.manifestPath, context.manifest);
            else if (action.id === 'edit')
                await this.editProfile(context.manifestPath, context.manifest, active);
            else if (action.id === 'duplicate')
                await this.duplicateProfile(context.manifestPath, context.manifest, active);
            else if (action.id === 'delete' && context.manifest.profiles.platforms.length > 1)
                await this.deleteProfile(context.manifestPath, context.manifest, active);
            else if (action.id === 'report')
                await this.openReport();
            context.manifest = (0, qtProjectManifest_1.readQtProjectManifest)(context.manifestPath);
            this.workspaces.refresh();
            this.changed.fire();
        }
    }
    async selectActivePlatform(manifestPath, manifest) {
        const context = manifestPath && manifest ? { manifestPath, manifest } : this.readContext();
        if (!context)
            return undefined;
        const current = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(context.manifest);
        const selected = await vscode.window.showQuickPick(context.manifest.profiles.platforms.map((profile) => ({
            label: profile.name,
            description: `${platformLabel(profile.type)} · ${profile.buildLocation}`,
            detail: this.profileDetail(profile),
            profile,
            picked: profile.id === current.id
        })), { title: 'Select active Qt platform' });
        if (!selected)
            return undefined;
        context.manifest.profiles.active.platformProfileId = selected.profile.id;
        context.manifest.profiles.active.kitProfileId = selected.profile.kitId;
        context.manifest.profiles.active.runProfileId = selected.profile.runProfileId;
        context.manifest.profiles.active.deployProfileId = selected.profile.deployProfileId;
        context.manifest.profiles.active.debugProfileId = selected.profile.debugProfileId;
        (0, qtProjectManifest_1.writeQtProjectManifest)(context.manifestPath, context.manifest);
        vscode.window.showInformationMessage(`Active Qt platform: ${selected.profile.name}.`);
        this.changed.fire();
        return selected.profile;
    }
    detectCapabilities(profile) {
        const active = profile ?? this.activeProfile;
        if (!active)
            return { platform: 'desktop', ready: false, summary: 'No active native Qt project', details: ['Open a .qtproject.json project.'], tools: {} };
        const tools = {};
        const details = [];
        let ready = true;
        if (active.type === 'desktop' || active.type === 'linux-local') {
            details.push(active.type === 'linux-local' ? 'The target runs on the local Linux host.' : 'The target runs on the local desktop host.');
            if (active.type === 'linux-local' && process.platform !== 'linux') {
                ready = false;
                details.push('Linux Local requires VS Code/QPM to run on Linux.');
            }
        }
        else if (active.type === 'remote-linux') {
            tools.ssh = resolveExecutable(active.sshExecutable, 'ssh');
            tools.scp = resolveExecutable(active.scpExecutable, 'scp');
            tools.rsync = resolveExecutable(active.rsyncExecutable, 'rsync');
            if (!active.sshHost) {
                ready = false;
                details.push('SSH host is not configured.');
            }
            if (!tools.ssh) {
                ready = false;
                details.push('SSH executable was not found.');
            }
            if (active.useRsync && !tools.rsync && !tools.scp) {
                ready = false;
                details.push('Neither rsync nor scp was found for synchronization.');
            }
            if (!active.remoteProjectDirectory) {
                ready = false;
                details.push('Remote project directory is not configured.');
            }
            details.push(`Build location: ${active.buildLocation}.`);
            details.push(`Remote endpoint: ${sshDestination(active) || 'not configured'}:${active.sshPort}.`);
        }
        else if (active.type === 'docker') {
            tools.docker = resolveExecutable(active.dockerExecutable, 'docker');
            if (!tools.docker) {
                ready = false;
                details.push('Docker executable was not found.');
            }
            if (!active.dockerImage) {
                ready = false;
                details.push('Docker image is not configured.');
            }
            details.push(`Container workspace: ${active.dockerWorkspace}.`);
            details.push(active.dockerKeepContainer ? 'The container is kept after execution.' : 'Ephemeral containers are used.');
        }
        else if ((0, qpmQtAppleService_1.isApplePlatform)(active.type)) {
            const appleReport = this.apple?.detectEnvironment(active);
            if (!appleReport) {
                ready = false;
                details.push('Apple platform support service is unavailable.');
            }
            else {
                ready = appleReport.ready;
                Object.assign(tools, appleReport.tools);
                details.push(...appleReport.details);
            }
        }
        else if (active.type === 'android') {
            const androidReport = this.android?.detectEnvironment(active);
            if (!androidReport) {
                ready = false;
                details.push('Android support service is unavailable.');
            }
            else {
                ready = androidReport.ready;
                Object.assign(tools, androidReport.tools);
                details.push(...androidReport.details);
            }
        }
        else if (active.type === 'webassembly') {
            tools.qtwasmserver = resolveExecutable(active.wasmServerExecutable, 'qtwasmserver');
            tools.python = resolveExecutable(vscode.workspace.getConfiguration('qpm').get('pythonExecutable', ''), process.platform === 'win32' ? 'python' : 'python3')
                ?? resolveExecutable('', 'python');
            tools.emcc = findEmscriptenCompiler(active);
            if (!tools.qtwasmserver && !tools.python) {
                ready = false;
                details.push('Neither qtwasmserver nor Python was found for local HTTP serving.');
            }
            if (active.emsdkRoot && !tools.emcc)
                details.push('The configured emsdk root does not expose emcc.');
            details.push(`HTTP port: ${active.wasmServerPort}.`);
            details.push(active.wasmOpenBrowser ? 'The default browser opens automatically.' : 'Automatic browser opening is disabled.');
        }
        return {
            platform: active.type,
            ready,
            summary: ready ? `${platformLabel(active.type)} is ready` : `${platformLabel(active.type)} needs configuration`,
            details,
            tools
        };
    }
    async buildActive(rebuild = false) {
        const context = this.readContext();
        if (!context)
            return false;
        const profile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(context.manifest);
        this.begin(`Build ${context.manifest.name} for ${profile.name}`);
        if ((0, qpmQtAppleService_1.isApplePlatform)(profile.type))
            return this.apple?.buildActive() ?? false;
        if (profile.type === 'android') {
            const result = await this.android?.buildPackage(profile.androidPackageFormat);
            return result?.success ?? false;
        }
        if (profile.type === 'remote-linux' && profile.buildLocation === 'remote')
            return this.remoteBuild(context.manifestPath, context.manifest, profile);
        if (profile.type === 'docker' && profile.buildLocation === 'container')
            return this.dockerBuild(context.manifestPath, context.manifest, profile);
        return this.builds.build(rebuild);
    }
    async deployActive() {
        const context = this.readContext();
        if (!context)
            return false;
        const profile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(context.manifest);
        this.begin(`Deploy ${context.manifest.name} to ${profile.name}`);
        if (profile.type === 'macos')
            return this.apple?.deployMacApplication(false) ?? false;
        if (profile.type === 'ios-simulator') {
            this.output.appendLine('[Qt Platform] iOS Simulator deployment is performed together with application launch.');
            return true;
        }
        if (profile.type === 'ios-device') {
            this.output.appendLine('[Qt Platform] Physical iOS deployment is delegated to Xcode in QPM 0.14.0. The generated Xcode project and signed build remain available.');
            return true;
        }
        if (profile.type === 'android')
            return this.android?.installPackage() ?? false;
        if (profile.type === 'remote-linux')
            return this.remoteDeploy(context.manifestPath, context.manifest, profile);
        if (profile.type === 'docker') {
            this.output.appendLine('[Qt Platform] Docker builds use a mounted project directory; no separate copy step is required unless a custom workflow is configured.');
            return true;
        }
        if (profile.type === 'webassembly') {
            const html = this.resolveWasmEntry(context.manifestPath, context.manifest, profile);
            if (!html) {
                vscode.window.showErrorMessage('No WebAssembly HTML entry was found. Build the target or configure wasmHtmlEntry.');
                return false;
            }
            this.output.appendLine(`[Qt Platform] WebAssembly entry ready: ${html}`);
            return true;
        }
        return this.builds.deployQtRuntime();
    }
    async runActive() {
        const context = this.readContext();
        if (!context)
            return false;
        const profile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(context.manifest);
        this.begin(`Run ${context.manifest.name} on ${profile.name}`);
        if (profile.type === 'ios-simulator')
            return this.apple?.installAndRunIosSimulator() ?? false;
        if (profile.type === 'ios-device') {
            vscode.window.showWarningMessage('QPM 0.14.0 builds and signs physical iOS targets, but device launch remains delegated to Xcode.');
            return false;
        }
        if (profile.type === 'android')
            return this.android?.runApplication() ?? false;
        if (profile.type === 'remote-linux')
            return this.remoteRun(context.manifestPath, context.manifest, profile);
        if (profile.type === 'docker')
            return this.dockerRun(context.manifestPath, context.manifest, profile);
        if (profile.type === 'webassembly')
            return this.serveWebAssembly();
        await this.builds.runWithoutBuild();
        return true;
    }
    async buildDeployRun() {
        if (this.activeProfile?.type === 'android')
            return this.android?.buildInstallRun() ?? false;
        if (this.activeProfile?.type === 'ios-simulator') {
            if (!await (this.apple?.buildActive() ?? Promise.resolve(false)))
                return false;
            return this.apple?.installAndRunIosSimulator() ?? false;
        }
        if (this.activeProfile?.type === 'ios-device')
            return this.apple?.buildActive() ?? false;
        if (!await this.buildActive(false))
            return false;
        if (!await this.deployActive())
            return false;
        return this.runActive();
    }
    async openRemoteTerminal() {
        const profile = this.activeProfile;
        if (!profile || profile.type !== 'remote-linux') {
            vscode.window.showErrorMessage('Select a Remote Linux platform profile first.');
            return;
        }
        const destination = sshDestination(profile);
        if (!destination) {
            vscode.window.showErrorMessage('Configure the Remote Linux SSH host.');
            return;
        }
        const ssh = (resolveExecutable(profile.sshExecutable, 'ssh') ?? profile.sshExecutable) || 'ssh';
        const terminal = vscode.window.createTerminal({ name: `QPM SSH — ${profile.name}`, shellPath: ssh, shellArgs: ['-p', String(profile.sshPort), destination] });
        terminal.show();
    }
    async openDockerShell() {
        const profile = this.activeProfile;
        if (!profile || profile.type !== 'docker') {
            vscode.window.showErrorMessage('Select a Docker platform profile first.');
            return;
        }
        const context = this.readContext();
        if (!context)
            return;
        const docker = (resolveExecutable(profile.dockerExecutable, 'docker') ?? profile.dockerExecutable) || 'docker';
        const root = path.dirname(context.manifestPath);
        const args = ['run', '--rm', '-it', '-v', `${root}:${profile.dockerWorkspace}`, '-w', profile.dockerWorkspace, ...profile.dockerArguments, profile.dockerImage, '/bin/sh'];
        const terminal = vscode.window.createTerminal({ name: `QPM Docker — ${profile.name}`, shellPath: docker, shellArgs: args });
        terminal.show();
    }
    async serveWebAssembly() {
        const context = this.readContext();
        if (!context)
            return false;
        const profile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(context.manifest);
        if (profile.type !== 'webassembly') {
            vscode.window.showErrorMessage('Select a WebAssembly platform profile first.');
            return false;
        }
        const htmlPath = this.resolveWasmEntry(context.manifestPath, context.manifest, profile);
        if (!htmlPath) {
            vscode.window.showErrorMessage('No WebAssembly HTML entry was found. Build the project or configure the HTML entry.');
            return false;
        }
        this.stopWebAssemblyServer(false);
        const directory = path.dirname(htmlPath);
        const qtServer = resolveExecutable(profile.wasmServerExecutable, 'qtwasmserver');
        const python = resolveExecutable(vscode.workspace.getConfiguration('qpm').get('pythonExecutable', ''), process.platform === 'win32' ? 'python' : 'python3')
            ?? resolveExecutable('', 'python');
        let executable = qtServer;
        let args = [];
        if (qtServer) {
            args = ['--port', String(profile.wasmServerPort), directory, ...profile.wasmServerArguments];
        }
        else if (python) {
            executable = python;
            args = ['-m', 'http.server', String(profile.wasmServerPort), '--directory', directory, ...profile.wasmServerArguments];
        }
        if (!executable) {
            vscode.window.showErrorMessage('qtwasmserver or Python is required to serve a WebAssembly application.');
            return false;
        }
        this.output.appendLine(`[Qt Platform] WebAssembly server: ${executable} ${args.map(shellQuote).join(' ')}`);
        const child = (0, child_process_1.spawn)(executable, args, { cwd: directory, env: { ...process.env, ...profile.environment }, windowsHide: true, shell: false });
        this.wasmServer = child;
        this.wasmServerDescription = `http://127.0.0.1:${profile.wasmServerPort}/${encodeURIComponent(path.basename(htmlPath))}`;
        child.stdout?.on('data', (data) => this.output.append(String(data)));
        child.stderr?.on('data', (data) => this.output.append(String(data)));
        child.on('error', (error) => {
            this.output.appendLine(`[Qt Platform] WebAssembly server failed: ${error.message}`);
            this.wasmServer = undefined;
            this.wasmServerDescription = '';
            this.changed.fire();
        });
        child.on('exit', (code) => {
            this.output.appendLine(`[Qt Platform] WebAssembly server exited with code ${String(code)}.`);
            this.wasmServer = undefined;
            this.wasmServerDescription = '';
            this.changed.fire();
        });
        this.changed.fire();
        if (profile.wasmOpenBrowser)
            await vscode.env.openExternal(vscode.Uri.parse(this.wasmServerDescription));
        vscode.window.showInformationMessage(`WebAssembly server started on port ${profile.wasmServerPort}.`);
        return true;
    }
    stopWebAssemblyServer(announce = true) {
        if (!this.wasmServer)
            return;
        this.wasmServer.kill();
        this.wasmServer = undefined;
        this.wasmServerDescription = '';
        if (announce)
            vscode.window.showInformationMessage('QPM WebAssembly server stopped.');
        this.changed.fire();
    }
    async openReport() {
        const profile = this.activeProfile;
        const capabilities = this.detectCapabilities(profile);
        const lines = [
            '# Qt Platform Report', '',
            `Platform: ${profile?.name ?? 'none'}`,
            `Type: ${profile ? platformLabel(profile.type) : 'none'}`,
            `Status: ${capabilities.ready ? 'Ready' : 'Needs configuration'}`, '',
            '## Details', '',
            ...capabilities.details.map((entry) => `- ${entry}`), '',
            '## Tools', '',
            ...Object.entries(capabilities.tools).map(([name, value]) => `- ${name}: ${value ?? 'not found'}`)
        ];
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
        await vscode.window.showTextDocument(document, { preview: true });
    }
    async createProfile(manifestPath, manifest) {
        const selected = await vscode.window.showQuickPick([
            { label: 'Desktop', value: 'desktop', description: 'Local Windows, Linux or macOS desktop' },
            { label: 'Linux Local', value: 'linux-local', description: 'Local Linux host' },
            { label: 'Remote Linux', value: 'remote-linux', description: 'SSH deployment and GDB Server' },
            { label: 'Docker', value: 'docker', description: 'Containerized qmake/CMake build and run' },
            { label: 'WebAssembly', value: 'webassembly', description: 'Qt for WebAssembly served in a browser' },
            { label: 'Android', value: 'android', description: 'Qt for Android, Gradle packaging, ADB devices and emulators' },
            { label: 'macOS', value: 'macos', description: 'Qt for macOS, app bundles, signing, DMG and notarization' },
            { label: 'iOS Simulator', value: 'ios-simulator', description: 'Xcode build, simulator selection, install and launch' },
            { label: 'iOS Device', value: 'ios-device', description: 'Xcode archive/build with Apple signing configuration' }
        ], { title: 'Create Qt platform profile' });
        if (!selected)
            return;
        const name = await vscode.window.showInputBox({ title: 'Platform profile name', value: platformLabel(selected.value), validateInput: (value) => value.trim() ? undefined : 'A name is required.' });
        if (!name)
            return;
        const base = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(manifest);
        const profile = {
            ...JSON.parse(JSON.stringify(base)),
            id: uniqueProfileId(name, manifest.profiles.platforms.map((entry) => entry.id)),
            name: name.trim(),
            type: selected.value,
            buildLocation: selected.value === 'remote-linux' ? 'local' : selected.value === 'docker' ? 'container' : 'local',
            dockerImage: selected.value === 'docker' ? 'ubuntu:24.04' : base.dockerImage,
            wasmOpenBrowser: true
        };
        manifest.profiles.platforms.push(profile);
        manifest.profiles.active.platformProfileId = profile.id;
        (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
        await this.editProfile(manifestPath, manifest, profile);
    }
    async duplicateProfile(manifestPath, manifest, source) {
        const name = await vscode.window.showInputBox({ title: 'Duplicate platform profile', value: `${source.name} Copy` });
        if (!name)
            return;
        const copy = JSON.parse(JSON.stringify(source));
        copy.id = uniqueProfileId(name, manifest.profiles.platforms.map((entry) => entry.id));
        copy.name = name.trim();
        manifest.profiles.platforms.push(copy);
        manifest.profiles.active.platformProfileId = copy.id;
        (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
    }
    async deleteProfile(manifestPath, manifest, profile) {
        const confirmed = await vscode.window.showWarningMessage(`Delete platform profile ${profile.name}?`, { modal: true }, 'Delete');
        if (confirmed !== 'Delete')
            return;
        manifest.profiles.platforms = manifest.profiles.platforms.filter((entry) => entry.id !== profile.id);
        manifest.profiles.active.platformProfileId = manifest.profiles.platforms[0].id;
        (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
    }
    async editProfile(manifestPath, manifest, profile) {
        while (true) {
            const fields = platformEditFields(profile);
            const selected = await vscode.window.showQuickPick([...fields, { id: 'save', label: '$(save) Save platform', description: 'Persist all changes' }], { title: `Edit platform — ${profile.name}` });
            if (!selected)
                return;
            if (selected.id === 'save') {
                (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
                vscode.window.showInformationMessage(`Qt platform ${profile.name} saved.`);
                return;
            }
            await editPlatformField(profile, selected.id, manifest);
        }
    }
    async remoteBuild(manifestPath, manifest, profile) {
        const capabilities = this.detectCapabilities(profile);
        if (!capabilities.ready) {
            vscode.window.showErrorMessage(capabilities.summary);
            return false;
        }
        if (!await this.syncRemoteProject(manifestPath, profile))
            return false;
        const build = findBuildProfile(manifest, profile.buildProfileId) ?? (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, this.builds.buildMode);
        if (build.system === 'direct' && !profile.remoteBuildCommand) {
            vscode.window.showErrorMessage('Remote builds require qmake, CMake or a custom remote build command. The Direct backend can be built locally and deployed remotely.');
            return false;
        }
        const command = profile.remoteBuildCommand || defaultRemoteBuildCommand(manifest, build, profile);
        return (await this.runSsh(profile, command, 'Remote Linux build')).success;
    }
    async remoteDeploy(manifestPath, manifest, profile) {
        const target = (0, qtProjectManifest_1.qtTargetPath)(manifestPath, this.builds.buildMode, manifest);
        if (!fs.existsSync(target)) {
            vscode.window.showErrorMessage(`Local target not found: ${target}`);
            return false;
        }
        const destination = sshDestination(profile);
        if (!destination)
            return false;
        const remoteDirectory = profile.remoteDeployDirectory || profile.remoteProjectDirectory;
        if (!(await this.runSsh(profile, `mkdir -p ${shellQuote(remoteDirectory)}`, 'Prepare remote deployment directory')).success)
            return false;
        const scp = (resolveExecutable(profile.scpExecutable, 'scp') ?? profile.scpExecutable) || 'scp';
        const args = ['-P', String(profile.sshPort), target, `${destination}:${remoteDirectory.replace(/\/$/, '')}/`];
        return (await this.runProcess(scp, args, path.dirname(manifestPath), profile.environment, 'Deploy target with scp')).success;
    }
    async remoteRun(manifestPath, manifest, profile) {
        const target = (0, qtProjectManifest_1.qtTargetPath)(manifestPath, this.builds.buildMode, manifest);
        const remoteDirectory = profile.remoteDeployDirectory || profile.remoteProjectDirectory;
        const executable = profile.remoteRunCommand || `cd ${shellQuote(remoteDirectory)} && chmod +x ${shellQuote(path.basename(target))} && ./${shellQuote(path.basename(target))}`;
        const command = profile.startGdbServer
            ? `cd ${shellQuote(remoteDirectory)} && gdbserver :${profile.gdbServerPort} ./${shellQuote(path.basename(target))}`
            : executable;
        return (await this.runSsh(profile, command, profile.startGdbServer ? 'Start remote GDB Server' : 'Run remote target')).success;
    }
    async syncRemoteProject(manifestPath, profile) {
        const root = path.dirname(manifestPath);
        const destination = sshDestination(profile);
        if (!destination)
            return false;
        if (!(await this.runSsh(profile, `mkdir -p ${shellQuote(profile.remoteProjectDirectory)}`, 'Prepare remote project directory')).success)
            return false;
        const rsync = resolveExecutable(profile.rsyncExecutable, 'rsync');
        if (profile.useRsync && rsync) {
            const sshCommand = `${(resolveExecutable(profile.sshExecutable, 'ssh') ?? profile.sshExecutable) || 'ssh'} -p ${profile.sshPort}`;
            const source = `${root.replace(/\\/g, '/')}/`;
            const args = ['-az', '--delete', '--exclude', '.git', '--exclude', 'build', '-e', sshCommand, source, `${destination}:${profile.remoteProjectDirectory.replace(/\/$/, '')}/`];
            return (await this.runProcess(rsync, args, root, profile.environment, 'Synchronize project with rsync')).success;
        }
        const scp = (resolveExecutable(profile.scpExecutable, 'scp') ?? profile.scpExecutable) || 'scp';
        const args = ['-P', String(profile.sshPort), '-r', root, `${destination}:${path.posix.dirname(profile.remoteProjectDirectory)}/`];
        return (await this.runProcess(scp, args, path.dirname(root), profile.environment, 'Synchronize project with scp')).success;
    }
    async dockerBuild(manifestPath, manifest, profile) {
        const capabilities = this.detectCapabilities(profile);
        if (!capabilities.ready) {
            vscode.window.showErrorMessage(capabilities.summary);
            return false;
        }
        const build = findBuildProfile(manifest, profile.buildProfileId) ?? (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, this.builds.buildMode);
        if (build.system === 'direct' && !profile.dockerBuildCommand) {
            vscode.window.showErrorMessage('Docker builds require qmake, CMake or a custom Docker build command.');
            return false;
        }
        const root = path.dirname(manifestPath);
        const command = profile.dockerBuildCommand || defaultDockerBuildCommand(manifest, build, profile);
        const args = this.dockerBaseArgs(profile, root, false);
        args.push(profile.dockerImage, '/bin/sh', '-lc', command);
        const docker = (resolveExecutable(profile.dockerExecutable, 'docker') ?? profile.dockerExecutable) || 'docker';
        return (await this.runProcess(docker, args, root, profile.environment, 'Docker Qt build')).success;
    }
    async dockerRun(manifestPath, manifest, profile) {
        const root = path.dirname(manifestPath);
        const build = findBuildProfile(manifest, profile.buildProfileId) ?? (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, this.builds.buildMode);
        const target = (0, qtProjectManifest_1.qtTargetPath)(manifestPath, this.builds.buildMode, manifest);
        const relativeTarget = path.relative(root, target).replace(/\\/g, '/');
        const command = profile.dockerRunCommand || `${shellQuote(path.posix.join(profile.dockerWorkspace, relativeTarget))}`;
        const args = this.dockerBaseArgs(profile, root, true);
        args.push(profile.dockerImage, '/bin/sh', '-lc', command || defaultContainerTarget(manifest, build, profile));
        const docker = (resolveExecutable(profile.dockerExecutable, 'docker') ?? profile.dockerExecutable) || 'docker';
        return (await this.runProcess(docker, args, root, profile.environment, 'Docker Qt run')).success;
    }
    dockerBaseArgs(profile, root, interactive) {
        const args = ['run'];
        if (!profile.dockerKeepContainer)
            args.push('--rm');
        if (interactive)
            args.push('-i');
        if (profile.dockerContainerName)
            args.push('--name', profile.dockerContainerName);
        args.push('-v', `${root}:${profile.dockerWorkspace}`, '-w', profile.dockerWorkspace);
        if (profile.dockerHostNetwork)
            args.push('--network', 'host');
        if (profile.dockerForwardDisplay && process.env.DISPLAY)
            args.push('-e', `DISPLAY=${process.env.DISPLAY}`, '-v', '/tmp/.X11-unix:/tmp/.X11-unix:rw');
        for (const [key, value] of Object.entries(profile.environment))
            args.push('-e', `${key}=${value}`);
        args.push(...profile.dockerArguments);
        return args;
    }
    async runSsh(profile, command, label) {
        const destination = sshDestination(profile);
        if (!destination) {
            vscode.window.showErrorMessage('Remote Linux SSH host is not configured.');
            return { success: false, code: null };
        }
        const ssh = (resolveExecutable(profile.sshExecutable, 'ssh') ?? profile.sshExecutable) || 'ssh';
        return this.runProcess(ssh, ['-p', String(profile.sshPort), destination, command], process.cwd(), profile.environment, label);
    }
    async runProcess(executable, args, cwd, environment, label) {
        this.output.appendLine(`[Qt Platform] ${label}`);
        this.output.appendLine(`[Qt Platform] Tool: ${executable}`);
        this.output.appendLine(`[Qt Platform] Arguments: ${args.map(shellQuote).join(' ')}`);
        return new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(executable, args, { cwd, env: { ...process.env, ...environment }, windowsHide: true, shell: false });
            child.stdout?.on('data', (data) => this.output.append(String(data)));
            child.stderr?.on('data', (data) => this.output.append(String(data)));
            child.on('error', (error) => {
                this.output.appendLine(`[Qt Platform] ${label} failed: ${error.message}`);
                vscode.window.showErrorMessage(`${label} failed. Open the Qt Project Manager output channel.`);
                resolve({ success: false, code: null });
            });
            child.on('exit', (code) => {
                const success = code === 0;
                this.output.appendLine(`[Qt Platform] ${label} exited with code ${String(code)}.`);
                if (!success)
                    vscode.window.showErrorMessage(`${label} failed with code ${String(code)}.`);
                resolve({ success, code });
            });
        });
    }
    resolveWasmEntry(manifestPath, manifest, profile) {
        const root = path.dirname(manifestPath);
        if (profile.wasmHtmlEntry) {
            const configured = path.isAbsolute(profile.wasmHtmlEntry) ? profile.wasmHtmlEntry : path.resolve(root, profile.wasmHtmlEntry);
            if (fs.existsSync(configured))
                return configured;
        }
        const build = findBuildProfile(manifest, profile.buildProfileId) ?? (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, this.builds.buildMode);
        const searchRoots = [path.resolve(root, build.outputDirectory), root];
        const names = [`${manifest.targetName}.html`, `${manifest.name}.html`, 'index.html'];
        for (const searchRoot of searchRoots) {
            const found = findFileAtDepth(searchRoot, names, 5);
            if (found)
                return found;
        }
        return undefined;
    }
    profileDetail(profile) {
        if (profile.type === 'remote-linux')
            return `${sshDestination(profile) || 'SSH not configured'} · ${profile.remoteProjectDirectory}`;
        if (profile.type === 'docker')
            return `${profile.dockerImage || 'image not configured'} · ${profile.dockerWorkspace}`;
        if (profile.type === 'webassembly')
            return `HTTP ${profile.wasmServerPort} · ${profile.wasmHtmlEntry || 'auto HTML detection'}`;
        if (profile.type === 'android')
            return `${profile.androidPackageFormat.toUpperCase()} · ${profile.androidBuildAllAbis ? 'all ABIs' : profile.androidAbis.join(', ')} · ${profile.androidDeviceSerial || 'automatic device'}`;
        if ((0, qpmQtAppleService_1.isApplePlatform)(profile.type))
            return `${(0, qpmQtAppleService_1.applePlatformLabel)(profile.type)} · ${profile.appleArchitectures.join(', ') || 'automatic architecture'} · ${profile.appleBundleIdentifier || 'automatic bundle ID'}`;
        return profile.type === 'linux-local' ? 'Local Linux host' : 'Local desktop host';
    }
    readContext() {
        const ref = this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
            return undefined;
        }
        return { manifestPath: ref.absolutePath, manifest: (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath) };
    }
    begin(title) {
        this.output.show(true);
        this.output.appendLine('');
        this.output.appendLine(`[Qt Platform] ${title}`);
    }
}
exports.QpmQtPlatformService = QpmQtPlatformService;
function platformLabel(type) {
    if ((0, qpmQtAppleService_1.isApplePlatform)(type))
        return (0, qpmQtAppleService_1.applePlatformLabel)(type);
    return type === 'linux-local' ? 'Linux Local' : type === 'remote-linux' ? 'Remote Linux' : type === 'docker' ? 'Docker' : type === 'webassembly' ? 'WebAssembly' : type === 'android' ? 'Android' : 'Desktop';
}
function platformEditFields(profile) {
    const common = [
        { id: 'name', label: 'Name', description: profile.name },
        { id: 'type', label: 'Platform type', description: platformLabel(profile.type) },
        { id: 'build-location', label: 'Build location', description: profile.buildLocation },
        { id: 'environment', label: 'Environment', description: Object.keys(profile.environment).length ? `${Object.keys(profile.environment).length} variable(s)` : 'none' },
        { id: 'sysroot', label: 'Sysroot', description: profile.sysroot || 'none' }
    ];
    if (profile.type === 'remote-linux')
        common.push({ id: 'ssh-host', label: 'SSH host', description: profile.sshHost || 'not set' }, { id: 'ssh-user', label: 'SSH user', description: profile.sshUser || 'current user' }, { id: 'ssh-port', label: 'SSH port', description: String(profile.sshPort) }, { id: 'remote-project', label: 'Remote project directory', description: profile.remoteProjectDirectory }, { id: 'remote-deploy', label: 'Remote deploy directory', description: profile.remoteDeployDirectory }, { id: 'remote-build', label: 'Remote build command', description: profile.remoteBuildCommand || 'automatic' }, { id: 'remote-run', label: 'Remote run command', description: profile.remoteRunCommand || 'automatic' }, { id: 'sync', label: 'Synchronization', description: profile.useRsync ? 'rsync preferred' : 'scp' }, { id: 'gdbserver', label: 'GDB Server', description: profile.startGdbServer ? `enabled · ${profile.gdbServerPort}` : 'disabled' });
    if (profile.type === 'docker')
        common.push({ id: 'docker-exe', label: 'Docker executable', description: profile.dockerExecutable }, { id: 'docker-image', label: 'Docker image', description: profile.dockerImage || 'not set' }, { id: 'docker-workspace', label: 'Container workspace', description: profile.dockerWorkspace }, { id: 'docker-build', label: 'Docker build command', description: profile.dockerBuildCommand || 'automatic' }, { id: 'docker-run', label: 'Docker run command', description: profile.dockerRunCommand || 'automatic' }, { id: 'docker-args', label: 'Additional Docker arguments', description: profile.dockerArguments.join(' ') || 'none' }, { id: 'docker-options', label: 'Container options', description: [profile.dockerKeepContainer ? 'keep' : 'ephemeral', profile.dockerForwardDisplay ? 'display' : '', profile.dockerHostNetwork ? 'host-network' : ''].filter(Boolean).join(', ') });
    if (profile.type === 'webassembly')
        common.push({ id: 'emsdk-root', label: 'emsdk root', description: profile.emsdkRoot || 'automatic' }, { id: 'emsdk-script', label: 'emsdk environment script', description: profile.emsdkEnvironmentScript || 'automatic' }, { id: 'wasm-server', label: 'WebAssembly server', description: profile.wasmServerExecutable || 'qtwasmserver / Python' }, { id: 'wasm-port', label: 'HTTP port', description: String(profile.wasmServerPort) }, { id: 'wasm-html', label: 'HTML entry', description: profile.wasmHtmlEntry || 'automatic' }, { id: 'wasm-browser', label: 'Open browser automatically', description: profile.wasmOpenBrowser ? 'yes' : 'no' });
    if ((0, qpmQtAppleService_1.isApplePlatform)(profile.type))
        common.push({ id: 'apple-environment', label: 'Apple environment', description: profile.appleDeveloperDirectory || 'automatic Xcode discovery' }, { id: 'apple-bundle', label: 'Bundle identifier', description: profile.appleBundleIdentifier || 'automatic' }, { id: 'apple-signing', label: 'Signing', description: profile.appleCodeSignIdentity || (profile.appleAutomaticSigning ? 'automatic' : 'not configured') }, { id: 'apple-architecture', label: 'Architectures', description: profile.appleArchitectures.join(', ') || 'automatic' }, { id: 'apple-target', label: profile.type === 'ios-simulator' ? 'Simulator' : profile.type === 'ios-device' ? 'Device' : 'Distribution', description: profile.type === 'ios-simulator' ? (profile.appleSimulatorId || 'automatic') : profile.type === 'ios-device' ? (profile.appleDeviceId || 'Xcode') : (profile.appleCreateDmg ? `DMG ${profile.appleDmgFileSystem}` : 'app bundle') });
    if (profile.type === 'android')
        common.push({ id: 'android-environment', label: 'Android environment', description: profile.androidSdkRoot || 'automatic SDK discovery' }, { id: 'android-abis', label: 'Android ABIs', description: profile.androidBuildAllAbis ? 'all installed Qt ABIs' : profile.androidAbis.join(', ') }, { id: 'android-package', label: 'Package', description: `${profile.androidPackageFormat.toUpperCase()} · ${profile.androidPackageName || 'automatic package name'}` }, { id: 'android-device', label: 'Device', description: profile.androidDeviceSerial || 'automatic' }, { id: 'android-avd', label: 'Android Virtual Device', description: profile.androidAvdName || 'not selected' });
    return common;
}
async function editPlatformField(profile, id, manifest) {
    if (id === 'name') {
        const value = await input('Platform name', profile.name);
        if (value)
            profile.name = value;
        return;
    }
    if (id === 'type') {
        const choice = await vscode.window.showQuickPick(['desktop', 'linux-local', 'remote-linux', 'docker', 'webassembly', 'android', 'macos', 'ios-simulator', 'ios-device'].map((value) => ({ label: platformLabel(value), value })));
        if (choice)
            profile.type = choice.value;
        return;
    }
    if (id === 'build-location') {
        const choice = await vscode.window.showQuickPick(['local', 'remote', 'container'].map((value) => ({ label: value, value })));
        if (choice)
            profile.buildLocation = choice.value;
        return;
    }
    if (id === 'environment') {
        const value = await input('Environment (NAME=value;OTHER=value)', environmentText(profile.environment));
        if (value !== undefined)
            profile.environment = parseEnvironment(value);
        return;
    }
    if (id === 'sysroot') {
        profile.sysroot = (await input('Sysroot', profile.sysroot)) ?? profile.sysroot;
        return;
    }
    if (id === 'ssh-host')
        profile.sshHost = (await input('SSH host', profile.sshHost)) ?? profile.sshHost;
    else if (id === 'ssh-user')
        profile.sshUser = (await input('SSH user', profile.sshUser)) ?? profile.sshUser;
    else if (id === 'ssh-port')
        profile.sshPort = await inputPort('SSH port', profile.sshPort);
    else if (id === 'remote-project')
        profile.remoteProjectDirectory = (await input('Remote project directory', profile.remoteProjectDirectory)) ?? profile.remoteProjectDirectory;
    else if (id === 'remote-deploy')
        profile.remoteDeployDirectory = (await input('Remote deploy directory', profile.remoteDeployDirectory)) ?? profile.remoteDeployDirectory;
    else if (id === 'remote-build')
        profile.remoteBuildCommand = (await input('Remote build command', profile.remoteBuildCommand)) ?? profile.remoteBuildCommand;
    else if (id === 'remote-run')
        profile.remoteRunCommand = (await input('Remote run command', profile.remoteRunCommand)) ?? profile.remoteRunCommand;
    else if (id === 'sync') {
        const choice = await vscode.window.showQuickPick([{ label: 'Prefer rsync', value: true }, { label: 'Use scp', value: false }]);
        if (choice)
            profile.useRsync = choice.value;
    }
    else if (id === 'gdbserver') {
        const choice = await vscode.window.showQuickPick([{ label: 'Enable GDB Server', value: true }, { label: 'Disable GDB Server', value: false }]);
        if (choice) {
            profile.startGdbServer = choice.value;
            if (choice.value)
                profile.gdbServerPort = await inputPort('GDB Server port', profile.gdbServerPort);
        }
    }
    else if (id === 'docker-exe')
        profile.dockerExecutable = (await input('Docker executable', profile.dockerExecutable)) ?? profile.dockerExecutable;
    else if (id === 'docker-image')
        profile.dockerImage = (await input('Docker image', profile.dockerImage)) ?? profile.dockerImage;
    else if (id === 'docker-workspace')
        profile.dockerWorkspace = (await input('Container workspace directory', profile.dockerWorkspace)) ?? profile.dockerWorkspace;
    else if (id === 'docker-build')
        profile.dockerBuildCommand = (await input('Docker build command', profile.dockerBuildCommand)) ?? profile.dockerBuildCommand;
    else if (id === 'docker-run')
        profile.dockerRunCommand = (await input('Docker run command', profile.dockerRunCommand)) ?? profile.dockerRunCommand;
    else if (id === 'docker-args') {
        const value = await input('Additional Docker arguments', profile.dockerArguments.join(' '));
        if (value !== undefined)
            profile.dockerArguments = splitArguments(value);
    }
    else if (id === 'docker-options') {
        const selected = await vscode.window.showQuickPick([{ label: 'Keep container', value: 'keep', picked: profile.dockerKeepContainer }, { label: 'Forward X11 display', value: 'display', picked: profile.dockerForwardDisplay }, { label: 'Use host network', value: 'network', picked: profile.dockerHostNetwork }], { canPickMany: true });
        if (selected) {
            profile.dockerKeepContainer = selected.some(x => x.value === 'keep');
            profile.dockerForwardDisplay = selected.some(x => x.value === 'display');
            profile.dockerHostNetwork = selected.some(x => x.value === 'network');
        }
    }
    else if (id === 'emsdk-root')
        profile.emsdkRoot = (await input('emsdk root', profile.emsdkRoot)) ?? profile.emsdkRoot;
    else if (id === 'emsdk-script')
        profile.emsdkEnvironmentScript = (await input('emsdk environment script', profile.emsdkEnvironmentScript)) ?? profile.emsdkEnvironmentScript;
    else if (id === 'wasm-server')
        profile.wasmServerExecutable = (await input('qtwasmserver or Python executable', profile.wasmServerExecutable)) ?? profile.wasmServerExecutable;
    else if (id === 'wasm-port')
        profile.wasmServerPort = await inputPort('WebAssembly HTTP port', profile.wasmServerPort);
    else if (id === 'wasm-html')
        profile.wasmHtmlEntry = (await input('WebAssembly HTML entry', profile.wasmHtmlEntry)) ?? profile.wasmHtmlEntry;
    else if (id === 'wasm-browser') {
        const choice = await vscode.window.showQuickPick([{ label: 'Open browser automatically', value: true }, { label: 'Do not open browser', value: false }]);
        if (choice)
            profile.wasmOpenBrowser = choice.value;
    }
    else if (id === 'apple-environment' || id === 'apple-bundle' || id === 'apple-signing' || id === 'apple-architecture' || id === 'apple-target')
        await vscode.commands.executeCommand('qpm.configureAppleEnvironment');
    else if (id === 'android-environment')
        await vscode.commands.executeCommand('qpm.configureAndroidEnvironment');
    else if (id === 'android-abis')
        await vscode.commands.executeCommand('qpm.configureAndroidEnvironment');
    else if (id === 'android-package') {
        const choice = await vscode.window.showQuickPick([{ label: 'APK', value: 'apk' }, { label: 'Android App Bundle (AAB)', value: 'aab' }, { label: 'Android Archive (AAR)', value: 'aar' }]);
        if (choice)
            profile.androidPackageFormat = choice.value;
    }
    else if (id === 'android-device')
        await vscode.commands.executeCommand('qpm.selectAndroidDevice');
    else if (id === 'android-avd')
        await vscode.commands.executeCommand('qpm.selectAndroidAvd');
    const build = manifest.profiles.builds.find((entry) => entry.id === profile.buildProfileId);
    if (build && (profile.type === 'webassembly' || profile.type === 'android' || profile.type === 'ios-simulator' || profile.type === 'ios-device') && build.system === 'direct')
        build.system = 'cmake';
}
function findBuildProfile(manifest, id) { return manifest.profiles.builds.find((entry) => entry.id === id); }
function defaultRemoteBuildCommand(manifest, build, profile) {
    const variant = build.variant === 'release' ? 'Release' : 'Debug';
    const jobs = build.parallelJobs > 0 ? build.parallelJobs : Math.max(1, os.cpus().length);
    const root = profile.remoteProjectDirectory;
    if (build.system === 'cmake') {
        const directory = `${root.replace(/\/$/, '')}/.qpm-build/${build.id}`;
        return `cd ${shellQuote(root)} && cmake -S ${shellQuote(build.sourceDirectory || '.')} -B ${shellQuote(directory)} -DCMAKE_BUILD_TYPE=${variant} && cmake --build ${shellQuote(directory)} --parallel ${jobs}`;
    }
    const projectFile = build.projectFile || `.qpm/qmake/${build.id}/${manifest.name}.pro`;
    const directory = `${root.replace(/\/$/, '')}/.qpm-build/${build.id}`;
    return `mkdir -p ${shellQuote(directory)} && cd ${shellQuote(directory)} && qmake ${shellQuote(path.posix.join(root, projectFile.replace(/\\/g, '/')))} && make -j${jobs}`;
}
function defaultDockerBuildCommand(manifest, build, profile) {
    const variant = build.variant === 'release' ? 'Release' : 'Debug';
    const jobs = build.parallelJobs > 0 ? build.parallelJobs : Math.max(1, os.cpus().length);
    if (build.system === 'cmake') {
        const directory = path.posix.join(profile.dockerWorkspace, '.qpm-docker-build', build.id);
        return `cmake -S ${shellQuote(path.posix.join(profile.dockerWorkspace, build.sourceDirectory || '.'))} -B ${shellQuote(directory)} -DCMAKE_BUILD_TYPE=${variant} && cmake --build ${shellQuote(directory)} --parallel ${jobs}`;
    }
    const directory = path.posix.join(profile.dockerWorkspace, '.qpm-docker-build', build.id);
    const projectFile = build.projectFile || `.qpm/qmake/${build.id}/${manifest.name}.pro`;
    return `mkdir -p ${shellQuote(directory)} && cd ${shellQuote(directory)} && qmake ${shellQuote(path.posix.join(profile.dockerWorkspace, projectFile.replace(/\\/g, '/')))} && make -j${jobs}`;
}
function defaultContainerTarget(manifest, build, profile) {
    return path.posix.join(profile.dockerWorkspace, build.outputDirectory.replace(/\\/g, '/'), build.variant, manifest.targetName);
}
function sshDestination(profile) { return profile.sshHost ? `${profile.sshUser ? `${profile.sshUser}@` : ''}${profile.sshHost}` : ''; }
function resolveExecutable(configured, fallback) {
    const candidate = (configured || '').trim();
    if (candidate && (path.isAbsolute(candidate) || candidate.includes(path.sep)))
        return fs.existsSync(candidate) ? candidate : undefined;
    const name = candidate || fallback;
    const pathValue = process.env.PATH || '';
    const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
    for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
        for (const extension of extensions) {
            const file = path.join(directory, process.platform === 'win32' && !path.extname(name) ? `${name}${extension.toLowerCase()}` : name);
            try {
                if (fs.statSync(file).isFile())
                    return file;
            }
            catch { /* next */ }
        }
    }
    const probe = (0, child_process_1.spawnSync)(name, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 1500 });
    return probe.error ? undefined : name;
}
function findEmscriptenCompiler(profile) {
    const names = process.platform === 'win32' ? ['em++.bat', 'em++.exe', 'em++'] : ['em++'];
    const roots = [profile.emsdkRoot, profile.emsdkRoot ? path.join(profile.emsdkRoot, 'upstream', 'emscripten') : ''].filter(Boolean);
    for (const root of roots)
        for (const name of names) {
            const candidate = path.join(root, name);
            if (fs.existsSync(candidate))
                return candidate;
        }
    return resolveExecutable('', 'em++');
}
function findFileAtDepth(root, names, depth) {
    if (depth < 0 || !fs.existsSync(root))
        return undefined;
    for (const name of names) {
        const candidate = path.join(root, name);
        if (fs.existsSync(candidate))
            return candidate;
    }
    if (depth === 0)
        return undefined;
    let entries = [];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    }
    catch {
        return undefined;
    }
    for (const entry of entries)
        if (entry.isDirectory() && !entry.name.startsWith('.git') && entry.name !== 'node_modules') {
            const found = findFileAtDepth(path.join(root, entry.name), names, depth - 1);
            if (found)
                return found;
        }
    return undefined;
}
function parseEnvironment(value) {
    const result = {};
    for (const entry of value.split(/[;\r\n]+/)) {
        const index = entry.indexOf('=');
        if (index > 0)
            result[entry.slice(0, index).trim()] = entry.slice(index + 1).trim();
    }
    return result;
}
function environmentText(value) { return Object.entries(value).map(([key, entry]) => `${key}=${entry}`).join(';'); }
function splitArguments(value) { return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((entry) => entry.replace(/^"|"$/g, '')) ?? []; }
function uniqueProfileId(name, existing) { const base = name.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'platform'; let id = base; let index = 2; while (existing.includes(id))
    id = `${base}-${index++}`; return id; }
async function input(title, value) { return vscode.window.showInputBox({ title, value }); }
async function inputPort(title, value) { const text = await vscode.window.showInputBox({ title, value: String(value), validateInput: (entry) => { const n = Number(entry); return Number.isInteger(n) && n >= 1 && n <= 65535 ? undefined : 'Enter a port from 1 to 65535.'; } }); return text ? Number(text) : value; }
function shellQuote(value) { if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value))
    return value; return `'${value.replace(/'/g, `'"'"'`)}'`; }
