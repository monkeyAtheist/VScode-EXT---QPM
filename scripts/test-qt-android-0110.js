'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.34.2');
const commandIds = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const id of [
  'qpm.configureAndroidEnvironment','qpm.refreshAndroidDevices','qpm.selectAndroidDevice','qpm.selectAndroidAvd',
  'qpm.startAndroidAvd','qpm.installAndroidSdkPackages','qpm.buildAndroidApk','qpm.buildAndroidAab',
  'qpm.buildAndroidAar','qpm.installAndroidPackage','qpm.buildInstallRunAndroid','qpm.runAndroidApplication',
  'qpm.uninstallAndroidApplication','qpm.prepareAndroidDebug','qpm.startAndroidLogcat','qpm.stopAndroidLogcat',
  'qpm.openAndroidReport','qpm.revealAndroidPackage'
]) assert(commandIds.has(id), `${id} must be contributed`);
assert(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.android'));
for (const key of ['qpm.androidSdkRoot','qpm.androidNdkRoot','qpm.androidJdkRoot','qpm.androidAdbPath','qpm.androidEmulatorPath','qpm.androidDeployQtPath']) {
  assert(pkg.contributes.configuration.properties[key], `${key} setting missing`);
}

const originalLoad = Module._load;
class EventEmitter {
  constructor(){ this.event = () => ({ dispose(){} }); }
  fire(){}
  dispose(){}
}
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    EventEmitter,
    workspace: {
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      openTextDocument: async () => ({})
    },
    window: {
      showErrorMessage(){}, showWarningMessage(){}, showInformationMessage(){},
      showQuickPick: async () => undefined, showInputBox: async () => undefined,
      showOpenDialog: async () => undefined, showTextDocument: async () => undefined
    },
    commands: { executeCommand: async () => undefined },
    Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-android-0110-'));
(async () => {
try {
  const model = require('../out/model/qtProjectManifest');
  const android = require('../out/services/qpmQtAndroidService');
  const manifest = model.createDefaultQtProjectManifest('AndroidApp', 'quick-application');
  assert.strictEqual(manifest.schemaVersion, 19);
  const base = JSON.parse(JSON.stringify(manifest.profiles.platforms[0]));
  Object.assign(base, {
    id: 'android-platform', name: 'Android', type: 'android', buildLocation: 'local',
    androidSdkRoot: 'C:/Android/Sdk', androidNdkRoot: 'C:/Android/Sdk/ndk/27.2.12479018', androidJdkRoot: 'C:/Java/jdk-21',
    androidAbis: ['arm64-v8a', 'x86_64'], androidBuildAllAbis: false,
    androidCompileSdk: 36, androidTargetSdk: 36, androidMinSdk: 28, androidBuildToolsVersion: '36.0.0',
    androidPackageName: 'com.example.androidapp', androidAppName: 'Android App', androidVersionCode: 7, androidVersionName: '1.2.3', androidPackageFormat: 'apk',
    androidDeviceSerial: '', androidAvdName: 'Pixel_API_36', androidLogcatFilter: '*:S Qt:D',
    androidInstallReplace: true, androidUninstallBeforeInstall: false, androidOpenLogcatAfterRun: true,
    androidGradleArguments: [], androidCMakeArguments: [], androidKeystore: '', androidKeystoreAlias: '',
    androidStorePasswordEnvironment: 'QPM_ANDROID_STORE_PASSWORD', androidKeyPasswordEnvironment: 'QPM_ANDROID_KEY_PASSWORD'
  });
  manifest.profiles.platforms.push(base);
  manifest.profiles.active.platformProfileId = base.id;
  const manifestPath = path.join(temp, 'AndroidApp.qtproject.json');
  model.writeQtProjectManifest(manifestPath, manifest);
  const reloaded = model.readQtProjectManifest(manifestPath);
  const profile = model.getActiveQtPlatformProfile(reloaded);
  assert.strictEqual(profile.type, 'android');
  assert.deepStrictEqual(profile.androidAbis, ['arm64-v8a', 'x86_64']);
  assert.strictEqual(profile.androidCompileSdk, 36);
  assert.strictEqual(profile.androidPackageFormat, 'apk');
  assert.strictEqual(android.androidPackageName(profile, reloaded), 'com.example.androidapp');

  const devices = android.parseAdbDevices(`List of devices attached\nemulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:1\nR58M123 unauthorized usb:1-1 product:foo model:Galaxy_S23 device:dm3q transport_id:2\n`);
  assert.strictEqual(devices.length, 2);
  assert.strictEqual(devices[0].isEmulator, true);
  assert.strictEqual(devices[0].state, 'device');
  assert.strictEqual(devices[1].model, 'Galaxy S23');
  assert.strictEqual(devices[1].state, 'unauthorized');

  const packageRoot = path.join(temp, 'build');
  fs.mkdirSync(path.join(packageRoot, 'android-build', 'outputs', 'apk', 'debug'), { recursive: true });
  const oldApk = path.join(packageRoot, 'old.apk');
  const newApk = path.join(packageRoot, 'android-build', 'outputs', 'apk', 'debug', 'AndroidApp.apk');
  fs.writeFileSync(oldApk, 'old');
  fs.writeFileSync(newApk, 'new');
  const now = Date.now() / 1000;
  fs.utimesSync(oldApk, now - 60, now - 60);
  fs.utimesSync(newApk, now, now);
  assert.strictEqual(android.findLatestAndroidPackage(packageRoot, 'apk'), newApk);
  fs.writeFileSync(path.join(packageRoot, 'AndroidApp.aab'), 'bundle');
  assert.strictEqual(path.extname(android.findLatestAndroidPackage(packageRoot, 'aab')), '.aab');

  // End-to-end simulated Qt Android package build. The service executes a
  // fake qt-cmake and CMake target and must discover the resulting APK.
  const fakeRoot = path.join(temp, 'fake-android');
  const qtRoot = path.join(fakeRoot, 'Qt', '6.11.0', 'android_arm64_v8a');
  const qtBin = path.join(qtRoot, 'bin');
  const sdkRoot = path.join(fakeRoot, 'Android', 'Sdk');
  const ndkRoot = path.join(sdkRoot, 'ndk', '27.2.12479018');
  const jdkRoot = path.join(fakeRoot, 'jdk-21');
  const toolsRoot = path.join(fakeRoot, 'tools');
  for (const directory of [qtBin, path.join(sdkRoot, 'platforms', 'android-36'), path.join(sdkRoot, 'build-tools', '36.0.0'), path.join(sdkRoot, 'platform-tools'), ndkRoot, path.join(jdkRoot, 'bin'), toolsRoot]) fs.mkdirSync(directory, { recursive: true });
  const makeTool = (file, body) => { fs.writeFileSync(file, `#!/bin/sh\nset -eu\n${body}\n`, 'utf8'); fs.chmodSync(file, 0o755); };
  const qtCmakePath = path.join(qtBin, 'qt-cmake');
  makeTool(qtCmakePath, `build=''\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-B" ]; then shift; build="$1"; fi; shift || true; done\n[ -z "$build" ] || mkdir -p "$build"`);
  const cmakePath = path.join(toolsRoot, 'cmake');
  makeTool(cmakePath, `build=''\ntarget='apk'\nwhile [ "$#" -gt 0 ]; do case "$1" in --build) shift; build="$1";; --target) shift; target="$1";; esac; shift || true; done\nmkdir -p "$build/android-build/outputs/$target/debug"\ncase "$target" in apk) touch "$build/android-build/outputs/$target/debug/AndroidApp.apk";; aab) touch "$build/android-build/outputs/$target/debug/AndroidApp.aab";; aar) touch "$build/android-build/outputs/$target/debug/AndroidApp.aar";; esac`);
  const ninjaPath = path.join(toolsRoot, 'ninja'); makeTool(ninjaPath, 'exit 0');
  const javaPath = path.join(jdkRoot, 'bin', 'java'); makeTool(javaPath, `echo 'openjdk version \"21.0.4\"' 1>&2`);
  const adbPath = path.join(sdkRoot, 'platform-tools', 'adb'); makeTool(adbPath, 'if [ "${1:-}" = "devices" ]; then echo "List of devices attached"; echo "emulator-5554 device model:Pixel_8 device:emu64xa"; fi');
  const androidDeployQtPath = path.join(qtBin, 'androiddeployqt'); makeTool(androidDeployQtPath, 'exit 0');
  fs.writeFileSync(path.join(temp, 'main.cpp'), 'int main(){return 0;}\n');
  const buildManifest = model.createDefaultQtProjectManifest('AndroidApp', 'console-application');
  buildManifest.files.sources = ['main.cpp'];
  buildManifest.profiles.kits[0].qtInstallation = qtRoot;
  buildManifest.profiles.kits[0].deviceType = 'android';
  buildManifest.profiles.kits[0].architecture = 'auto';
  buildManifest.profiles.platforms[0] = { ...buildManifest.profiles.platforms[0], ...base, id: 'android-platform', type: 'android', androidSdkRoot: sdkRoot, androidNdkRoot: ndkRoot, androidJdkRoot: jdkRoot, androidAdbPath: adbPath, androidDeployQtPath, androidDeviceSerial: 'emulator-5554', androidPackageFormat: 'apk' };
  buildManifest.profiles.active.platformProfileId = 'android-platform';
  buildManifest.profiles.active.buildMode = 'debug64';
  model.writeQtProjectManifest(manifestPath, buildManifest);
  const workspaces = { activeProjectRef: { exists: true, absolutePath: manifestPath }, onDidChange: () => ({ dispose(){} }) };
  const qtInstallations = { getActive: () => ({ root: qtRoot, binDir: qtBin, version: '6.11.0', majorVersion: 6, label: 'Qt 6.11 Android arm64-v8a', compilerFamily: 'clang', architecture: 'arm64', androidAbi: 'arm64-v8a', isAndroid: true, cmakePath, ninjaPath, androidDeployQtPath }) };
  const output = { clear(){}, show(){}, append(){}, appendLine(){} };
  const service = new android.QpmQtAndroidService(workspaces, qtInstallations, output);
  const buildResult = await service.buildPackage('apk');
  assert.strictEqual(buildResult.success, true);
  assert.strictEqual(path.extname(buildResult.packagePath), '.apk');
  assert(fs.existsSync(buildResult.projectFile));
  const generatedCmake = fs.readFileSync(buildResult.projectFile, 'utf8');
  assert(generatedCmake.includes('QT_ANDROID_PACKAGE_NAME'));
  assert(generatedCmake.includes('QT_ANDROID_TARGET_SDK_VERSION 36'));
  service.dispose();

  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
  assert.strictEqual(schema.properties.schemaVersion.const, 19);
  assert(schema.$defs.platformProfile.properties.type.enum.includes('android'));
  for (const key of ['androidSdkRoot','androidAbis','androidCompileSdk','androidPackageName','androidPackageFormat','androidDeviceSerial','androidKeystore']) {
    assert(schema.$defs.platformProfile.properties[key], `schema property ${key} missing`);
  }
  const serviceSource = fs.readFileSync(path.join(root, 'src/services/qpmQtAndroidService.ts'), 'utf8');
  for (const marker of ['qt_add_executable', 'QT_ANDROID_PACKAGE_NAME', 'QT_ANDROID_MIN_SDK_VERSION', 'QT_ANDROID_TARGET_SDK_VERSION', 'QT_ANDROID_COMPILE_SDK_VERSION', 'QT_ANDROID_ABIS', "'--target', target", "'install'", "'logcat'"]) {
    assert(serviceSource.includes(marker), `Android service marker missing: ${marker}`);
  }
  const settingsSource = fs.readFileSync(path.join(root, 'src/views/qtProjectSettingsPanel.ts'), 'utf8');
  for (const marker of ['platformAndroidSdkRoot','platformAndroidAbis','platformAndroidPackageFormat','platformAndroidDeviceSerial','qpm.buildInstallRunAndroid']) {
    assert(settingsSource.includes(marker), `Android settings marker missing: ${marker}`);
  }
  console.log('QPM 0.11.0 Android kits, packaging, devices and logcat tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}
})().catch((error) => { console.error(error); process.exitCode = 1; });
