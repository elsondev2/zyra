// Zyra-maintained runtime. Derived from MIT-licensed Pi; see ../LICENSE and provenance.json.
import type { ProviderStreams } from "../types.ts";
import { lazyApi } from "./lazy.ts";

export const googleVertexApi = (): ProviderStreams => lazyApi(() => import("./google-vertex.ts"));
