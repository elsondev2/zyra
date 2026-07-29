#!/usr/bin/env node
import { formatZyraVersion, isZyraVersionRequest } from "./version.mjs";

const args = process.argv.slice(2);

if (isZyraVersionRequest(args)) {
  process.stdout.write(`${formatZyraVersion()}\n`);
} else {
  await import("./zyra-app.mjs");
}
