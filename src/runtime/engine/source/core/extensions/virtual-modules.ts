// Bundled extension imports remain static inside this optional module.
import * as _bundledPiAgentCore from "../../../../agent/source/index.js";
import * as _bundledPiAiCompat from "../../../../providers/source/compat.js";
import * as _bundledPiAiOauth from "../../../../providers/source/oauth.js";
import * as _bundledPiAiProviders from "../../../../providers/source/providers/all.js";
import * as _bundledPiTui from "../../../../terminal/source/index.js";
import * as _bundledTypebox from "typebox";
import * as _bundledTypeboxCompile from "typebox/compile";
import * as _bundledTypeboxValue from "typebox/value";
import * as _bundledPiCodingAgent from "../../index.ts";

/** Modules available to extensions via virtualModules (for compiled binaries) */
export const VIRTUAL_MODULES: Record<string, unknown> = {
 typebox: _bundledTypebox, "typebox/compile": _bundledTypeboxCompile, "typebox/value": _bundledTypeboxValue,
 "@sinclair/typebox": _bundledTypebox, "@sinclair/typebox/compile": _bundledTypeboxCompile, "@sinclair/typebox/value": _bundledTypeboxValue,
	"@zyra/engine": _bundledPiCodingAgent,
	"@zyra/agent": _bundledPiAgentCore,
	"@zyra/terminal": _bundledPiTui,
	"@zyra/providers": _bundledPiAiCompat,
	"@zyra/providers/compat": _bundledPiAiCompat,
	"@zyra/providers/oauth": _bundledPiAiOauth,
	"@zyra/providers/providers/all": _bundledPiAiProviders,
	"@earendil-works/pi-coding-agent": _bundledPiCodingAgent,
	"@mariozechner/pi-coding-agent": _bundledPiCodingAgent,
	"@earendil-works/pi-agent-core": _bundledPiAgentCore,
	"@mariozechner/pi-agent-core": _bundledPiAgentCore,
	"@earendil-works/pi-tui": _bundledPiTui,
	"@mariozechner/pi-tui": _bundledPiTui,
	"@earendil-works/pi-ai": _bundledPiAiCompat,
	"@mariozechner/pi-ai": _bundledPiAiCompat,
	"@earendil-works/pi-ai/compat": _bundledPiAiCompat,
	"@mariozechner/pi-ai/compat": _bundledPiAiCompat,
	"@earendil-works/pi-ai/oauth": _bundledPiAiOauth,
	"@mariozechner/pi-ai/oauth": _bundledPiAiOauth,
	"@earendil-works/pi-ai/providers/all": _bundledPiAiProviders,
	"@mariozechner/pi-ai/providers/all": _bundledPiAiProviders,
};
