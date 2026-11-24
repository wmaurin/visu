// Checks visu project files without a browser.
//
//   npm run check -- diagram.visu.json [more.visu.json …]
//   npm run check -- --routes diagram.visu.json
//
// Prints one line per finding and exits with 1 when there is any.
// With --routes it also prints each line's computed route and length,
// which helps to place labels on a straight run.
// Runs the app's TypeScript sources directly on Node's type stripping.
// They import without file extensions, as the bundler allows, so a
// resolve hook adds ".ts" where Node finds nothing.

import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || /\.\w+$/.test(specifier)) throw error;
      return next(`${specifier}.ts`, context);
    }
  },
});

const { lint, routes } = await import("../src/check/lint.ts");

const args = process.argv.slice(2);
const showRoutes = args.includes("--routes");
const files = args.filter((a) => a !== "--routes");
if (files.length === 0) {
  console.error("usage: npm run check -- [--routes] <file.visu.json> [...]");
  process.exit(2);
}

let total = 0;
for (const file of files) {
  const text = await readFile(file, "utf8");
  const findings = lint(text);
  if (showRoutes && !findings.some((f) => f.level === "error")) {
    for (const r of routes(text)) {
      const points = r.points.map((p) => `${p.x},${p.y}`).join(" ");
      console.log(`${file}: route: lines[${r.id}]: length ${Math.round(r.length)}: ${points}`);
    }
  }
  total += findings.length;
  for (const f of findings) console.log(`${file}: ${f.level}: ${f.where}: ${f.message}`);
  if (findings.length === 0) console.log(`${file}: ok`);
}
process.exit(total > 0 ? 1 : 0);
