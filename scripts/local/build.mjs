// Local build without Bazel (Windows-friendly).
// Generates a self-contained static site (default: dist-local/).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "../..");
export const dist = path.resolve(process.env.OUT_DIR || path.join(root, "dist-local"));

const FONTS = {
  "SourceCodePro-Regular.woff2":
    "https://raw.githubusercontent.com/adobe-fonts/source-code-pro/release/WOFF2/TTF/SourceCodePro-Regular.ttf.woff2",
  "SourceCodePro-Medium.woff2":
    "https://raw.githubusercontent.com/adobe-fonts/source-code-pro/release/WOFF2/TTF/SourceCodePro-Medium.ttf.woff2",
};

/** Resolves the repo's `#asciiflow/*` path alias the same way client/esbuild.config.mjs does. */
export const asciiflowResolvePlugin = {
  name: "asciiflow-resolve",
  setup(build) {
    build.onResolve({ filter: /^#asciiflow\// }, (args) =>
      build.resolve("./" + args.path.replace(/^#asciiflow\//, ""), {
        resolveDir: root,
        kind: args.kind,
      })
    );
  },
};

export function buildOptions(overrides = {}) {
  return {
    absWorkingDir: root,
    entryPoints: ["client/app.tsx"],
    bundle: true,
    outfile: path.join(dist, "bundle.js"),
    platform: "browser",
    target: ["es2020"],
    minify: process.env.MINIFY === "1",
    sourcemap: true,
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".module.css": "local-css" },
    resolveExtensions: [".js", ".jsx", ".ts", ".tsx", ".css"],
    plugins: [asciiflowResolvePlugin],
    logLevel: "info",
    ...overrides,
  };
}

/** Copies index.html, public/ and the self-hosted fonts into the output dir. */
export async function prepareAssets() {
  fs.mkdirSync(dist, { recursive: true });
  fs.copyFileSync(path.join(root, "client/index.html"), path.join(dist, "index.html"));
  fs.cpSync(path.join(root, "client/public"), path.join(dist, "public"), { recursive: true });

  const fontDir = path.join(dist, "public/fonts");
  fs.mkdirSync(fontDir, { recursive: true });
  for (const [name, url] of Object.entries(FONTS)) {
    const target = path.join(fontDir, name);
    if (fs.existsSync(target)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Font download failed: ${url} (${res.status})`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  }
}

export async function build() {
  const esbuild = await import("esbuild");
  fs.rmSync(dist, { recursive: true, force: true });
  await esbuild.build(buildOptions());
  await prepareAssets();
  console.log(`\nBuilt static site -> ${dist}`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  try {
    await build();
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND" && String(err.message).includes("esbuild")) {
      console.error("\nesbuild is missing. Install it without touching package.json:\n  npm i --no-save --ignore-scripts esbuild@0.25");
      process.exit(1);
    }
    throw err;
  }
}
