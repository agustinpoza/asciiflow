// Dev mode: esbuild watch + static server with live reload (port 8080 by default).
import { buildOptions, prepareAssets } from "./build.mjs";
import { startServer, broadcastReload } from "./serve.mjs";

let esbuild;
try {
  esbuild = await import("esbuild");
} catch (err) {
  if (err?.code === "ERR_MODULE_NOT_FOUND") {
    console.error("\nesbuild is missing. Install it without touching package.json:\n  npm i --no-save --ignore-scripts esbuild@0.25");
    process.exit(1);
  }
  throw err;
}

await prepareAssets();

const liveReloadPlugin = {
  name: "local-live-reload",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      await prepareAssets();
      broadcastReload();
      console.log("Rebuilt. Live reload notified.");
    });
  },
};

const base = buildOptions();
const ctx = await esbuild.context({
  ...base,
  plugins: [...base.plugins, liveReloadPlugin],
  logLevel: "warning",
});

await ctx.watch();
console.log("Watching client/ for changes...");
startServer({ liveReload: true });

// Ctrl+C: close the watcher and exit cleanly.
process.on("SIGINT", async () => {
  await ctx.dispose();
  process.exit(0);
});
