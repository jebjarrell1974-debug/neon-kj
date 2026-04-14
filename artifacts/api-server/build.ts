import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Packages that must NEVER be bundled — they have native binaries
// that must be installed for the target platform at runtime.
const nativeExternals = [
  "@libsql/client",
  "@libsql/linux-x64-gnu",
  "@libsql/linux-arm64-gnu",
  "@libsql/darwin-x64",
  "@libsql/darwin-arm64",
  "@libsql/win32-x64-msvc",
];

// Packages to inline into the bundle (pure JS, safe to bundle)
const allowlist = [
  "cors",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "qrcode",
  "ws",
  "zod",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];

  const externals = [
    ...nativeExternals,
    ...allDeps.filter(
      (dep) =>
        !allowlist.includes(dep) &&
        !(pkg.dependencies?.[dep]?.startsWith("workspace:"))
    ),
  ];

  const sharedConfig = {
    platform: "node" as const,
    bundle: true,
    format: "cjs" as const,
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    external: externals,
    logLevel: "info" as const,
  };

  // ── Standalone web server entry ──────────────────────────────────────────
  console.log("Building server (standalone)...");
  await esbuild({
    ...sharedConfig,
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    outfile: path.resolve(distDir, "index.cjs"),
  });

  // ── Electron entry — exports startServer() ───────────────────────────────
  console.log("Building server (electron-entry)...");
  await esbuild({
    ...sharedConfig,
    entryPoints: [path.resolve(__dirname, "src/electron-entry.ts")],
    outfile: path.resolve(distDir, "electron-entry.cjs"),
  });

  console.log("Build complete.");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
