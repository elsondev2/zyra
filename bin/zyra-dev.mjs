#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { developmentEnvironment } from "../src/development-launcher.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environment = developmentEnvironment({ root });
delete process.env.ZYRA_STANDALONE;
delete process.env.ELECTRON_RUN_AS_NODE;
Object.assign(process.env, environment);
await import("./zyra.mjs");
