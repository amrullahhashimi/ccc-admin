#!/usr/bin/env node
/**
 * What has to happen before the server boots.
 *
 * A Node script rather than a chain of shell operators, because npm runs
 * scripts through cmd.exe on Windows and sh elsewhere, and the two disagree
 * about how mixed && and || nest — a chain that behaves on the host silently
 * does something else on a developer's machine.
 *
 * The two steps are not equally important:
 *
 *   prisma generate — best effort. It guards against a client left stale by a
 *     schema change (which once cost us an afternoon: every Clover order import
 *     failed on a field the client still thought was required). But on Windows
 *     it fails with EPERM whenever another node process holds the query engine,
 *     and a locked file is no reason to leave the shop without an app.
 *
 *   prisma migrate deploy — required. Running against a database whose shape
 *     the code does not expect is how you corrupt data rather than merely fail.
 */

const { spawnSync } = require("child_process");

// Prisma's CLI is run through Node directly rather than through npx. Node
// refuses to spawn a .cmd shim without a shell (CVE-2024-27980), and turning
// the shell on means arguments get concatenated rather than escaped — so this
// sidesteps both by naming the CLI's own entry point.
const PRISMA_CLI = require.resolve("prisma/build/index.js");

function run(args, { required }) {
  const label = `prisma ${args.join(" ")}`;
  const result = spawnSync(process.execPath, [PRISMA_CLI, ...args], { stdio: "inherit" });

  if (result.status === 0) return true;

  if (required) {
    console.error(`[start] ${label} failed — refusing to boot against a database of unknown shape.`);
    process.exit(result.status || 1);
  }

  console.warn(`[start] ${label} failed — carrying on with the client already generated.`);
  return false;
}

run(["generate"], { required: false });
run(["migrate", "deploy"], { required: true });
