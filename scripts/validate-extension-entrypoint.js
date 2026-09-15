"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const packagePath = path.join(root, "package.json");
if (!fs.existsSync(packagePath)) {
  console.error(`[QPM] package.json not found in ${root}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (!manifest.main || typeof manifest.main !== "string") {
  console.error("[QPM] package.json has no valid main entry point.");
  process.exit(1);
}

const mainPath = path.resolve(root, manifest.main);
if (!fs.existsSync(mainPath) || !fs.statSync(mainPath).isFile()) {
  console.error(`[QPM] Extension entry point is missing: ${manifest.main}`);
  console.error(`[QPM] Resolved path: ${mainPath}`);
  process.exit(1);
}

const commands = (((manifest.contributes || {}).commands) || []).map((item) => item && item.command).filter(Boolean);
if (!commands.includes("qpm.openHome")) {
  console.error("[QPM] qpm.openHome is not contributed by package.json.");
  process.exit(1);
}

const runtime = fs.readFileSync(mainPath, "utf8");
const hasOpenHomeRegistration =
  runtime.includes("register('qpm.openHome'") ||
  runtime.includes('register("qpm.openHome"') ||
  runtime.includes("registerCommand('qpm.openHome'") ||
  runtime.includes('registerCommand("qpm.openHome"');
if (!hasOpenHomeRegistration) {
  console.error(`[QPM] qpm.openHome is contributed but not visibly registered in ${manifest.main}.`);
  process.exit(1);
}

console.log(`[QPM] Entry point OK: ${manifest.main}`);
console.log("[QPM] qpm.openHome contribution/registration OK.");
