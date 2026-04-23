import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, cp } from "fs/promises";

const allowlist = [
  "bcryptjs",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-session",
  "passport",
  "passport-local",
  "pg",
  "resend",
  "zod",
];

// Packages that must never be bundled regardless of the allowlist scan —
// they use __dirname / native bindings internally and break when inlined.
const alwaysExternal = [
  "connect-pg-simple",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = [
    ...new Set([
      ...allDeps.filter((dep) => !allowlist.includes(dep)),
      ...alwaysExternal,
    ]),
  ];

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("copying migrations...");
  await cp("migrations", "dist/migrations", { recursive: true });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
