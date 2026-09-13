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
exports.brandingArtifactsRoot = brandingArtifactsRoot;
exports.validateQtBranding = validateQtBranding;
exports.writeQtBrandingArtifacts = writeQtBrandingArtifacts;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const WINDOWS_EXECUTABLE_ICON_EXTENSIONS = new Set(['.ico']);
const WINDOW_ICON_EXTENSIONS = new Set(['.png', '.ico', '.bmp', '.jpg', '.jpeg', '.svg', '.webp', '.xpm']);
function brandingArtifactsRoot(manifestPath) {
    return path.join(path.dirname(manifestPath), '.qpm', 'branding', 'generated');
}
function validateQtBranding(manifestPath, manifest) {
    const root = path.dirname(manifestPath);
    const errors = [];
    const warnings = [];
    if (manifest.branding.executableIcon) {
        const icon = resolveProjectPath(root, manifest.branding.executableIcon);
        if (!fs.existsSync(icon))
            errors.push(`Executable icon was not found: ${manifest.branding.executableIcon}`);
        if (process.platform === 'win32' && !WINDOWS_EXECUTABLE_ICON_EXTENSIONS.has(path.extname(icon).toLowerCase())) {
            errors.push('The Windows executable icon must use the .ico format. The Qt window icon can use PNG, ICO or another Qt-supported image format.');
        }
    }
    if ((manifest.branding.executableIcon || (manifest.branding.windowIcon && manifest.branding.autoApplyWindowIcon))) {
        const externalBackends = manifest.profiles.builds.filter((profile) => (profile.system === 'qmake' || profile.system === 'cmake') && (!!profile.projectFile || !profile.generateProjectFiles));
        if (externalBackends.length) {
            warnings.push(`Application icon resources are integrated automatically by the Direct backend and QPM-generated qmake/CMake projects. External project files are not rewritten automatically (${externalBackends.map((profile) => profile.name).join(', ')}).`);
        }
    }
    if (manifest.branding.windowIcon) {
        const icon = resolveProjectPath(root, manifest.branding.windowIcon);
        if (!fs.existsSync(icon))
            errors.push(`Qt window icon was not found: ${manifest.branding.windowIcon}`);
        const extension = path.extname(icon).toLowerCase();
        if (extension && !WINDOW_ICON_EXTENSIONS.has(extension)) {
            warnings.push(`Qt window icon format ${extension} is unusual. Prefer PNG or ICO; SVG requires Qt SVG image support at runtime.`);
        }
        if (extension === '.svg' && !manifest.qt.modules.some((entry) => entry.toLowerCase() === 'svg')) {
            warnings.push('The Qt window icon is SVG, but the Svg module is not selected. Add Qt Svg or use PNG/ICO to avoid image-plugin dependency issues.');
        }
        if (manifest.python.enabled || manifest.kind === 'python-widgets-application' || manifest.kind === 'python-quick-application') {
            warnings.push('Automatic window-icon injection is currently provided for native C++ GUI targets. PySide6 projects should set QGuiApplication.setWindowIcon() in Python code.');
        }
        else if (!(0, qtProjectManifest_1.hasManagedWindowIcon)(manifest) && manifest.branding.autoApplyWindowIcon) {
            warnings.push(`Automatic window-icon injection is not applicable to project kind ${manifest.kind}.`);
        }
    }
    return { errors, warnings };
}
function writeQtBrandingArtifacts(manifestPath, manifest) {
    const root = brandingArtifactsRoot(manifestPath);
    const result = { root };
    if (!(0, qtProjectManifest_1.hasManagedWindowIcon)(manifest))
        return result;
    const projectRoot = path.dirname(manifestPath);
    const sourceIcon = resolveProjectPath(projectRoot, manifest.branding.windowIcon);
    if (!fs.existsSync(sourceIcon))
        throw new Error(`Qt window icon was not found: ${sourceIcon}`);
    const extension = path.extname(sourceIcon).toLowerCase() || '.png';
    fs.mkdirSync(root, { recursive: true });
    const iconCopy = path.join(root, `qpm_window_icon${extension}`);
    copyIfChanged(sourceIcon, iconCopy);
    const resourcePath = path.join(root, 'qpm_window_icon.qrc');
    const startupSource = path.join(root, 'qpm_window_icon.cpp');
    const resourceAlias = `window-icon${extension}`;
    writeTextIfChanged(resourcePath, renderWindowIconResource(path.basename(iconCopy), resourceAlias));
    writeTextIfChanged(startupSource, renderWindowIconStartupSource(resourceAlias));
    result.windowIconSource = sourceIcon;
    result.windowIconCopy = iconCopy;
    result.windowResource = resourcePath;
    result.windowStartupSource = startupSource;
    return result;
}
function renderWindowIconResource(iconFileName, alias) {
    return `<RCC>\n  <qresource prefix="/qpm/branding">\n    <file alias="${xmlEscape(alias)}">${xmlEscape(iconFileName)}</file>\n  </qresource>\n</RCC>\n`;
}
function renderWindowIconStartupSource(resourceAlias) {
    const resourceUrl = `:/qpm/branding/${resourceAlias}`;
    return `// Generated by Qt Project Manager. Do not edit.\n#include <QCoreApplication>\n#include <QGuiApplication>\n#include <QIcon>\n#include <QTimer>\n#include <QWindow>\n\nnamespace {\nvoid qpmApplyManagedWindowIcon()\n{\n    // Q_COREAPP_STARTUP_FUNCTION runs before GUI initialization is complete.\n    // Queue the GUI-specific icon update for the first event-loop turn.\n    QTimer::singleShot(0, QCoreApplication::instance(), []() {\n        const QIcon icon(QStringLiteral("${cppEscape(resourceUrl)}"));\n        QGuiApplication::setWindowIcon(icon);\n        // A top-level window may already have been shown before the event loop starts.\n        // Update only windows that did not explicitly choose their own icon.\n        for (QWindow *window : QGuiApplication::topLevelWindows()) {\n            if (window && window->icon().isNull()) window->setIcon(icon);\n        }\n    });\n}\n}\n\nQ_COREAPP_STARTUP_FUNCTION(qpmApplyManagedWindowIcon)\n`;
}
function resolveProjectPath(projectRoot, configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(projectRoot, configured);
}
function copyIfChanged(source, target) {
    if (fs.existsSync(target)) {
        const a = fs.statSync(source);
        const b = fs.statSync(target);
        if (a.size === b.size && fs.readFileSync(source).equals(fs.readFileSync(target)))
            return;
    }
    fs.copyFileSync(source, target);
}
function writeTextIfChanged(filePath, content) {
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content)
        return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}
function cppEscape(value) { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function xmlEscape(value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
