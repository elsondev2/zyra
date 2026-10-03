// Zyra-maintained runtime. Derived from MIT-licensed Pi; see ../LICENSE and provenance.json.
import type * as NodeOs from "node:os";

type ProcessWithOsBuiltinModule = typeof process & {
	getBuiltinModule?: (id: "node:os") => typeof NodeOs;
};

function loadNodeOs(): typeof NodeOs | null {
	if (typeof process === "undefined" || !(process.versions?.node || process.versions?.bun)) {
		return null;
	}
	return (process as ProcessWithOsBuiltinModule).getBuiltinModule?.("node:os") ?? null;
}

// Keep runtime OS loading browser-safe. A top-level runtime import of node:os breaks browser/Vite builds.
const nodeOs = loadNodeOs();

export function getZyraUserAgent(): string {
	return nodeOs ? `zyra (${nodeOs.platform()} ${nodeOs.release()}; ${nodeOs.arch()})` : "zyra (browser)";
}
