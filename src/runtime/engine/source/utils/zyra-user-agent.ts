// Zyra-maintained runtime. Derived from MIT-licensed Pi; see ../LICENSE and provenance.json.
export function getZyraUserAgent(version: string): string {
	const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
	return `zyra/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
