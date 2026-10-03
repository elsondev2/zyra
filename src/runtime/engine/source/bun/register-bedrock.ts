// Zyra-maintained runtime. Derived from MIT-licensed Pi; see ../LICENSE and provenance.json.
import { bedrockProviderModule } from "../../../providers/source/bedrock-provider.js";
import { setBedrockProviderModule } from "../../../providers/source/compat.js";

setBedrockProviderModule(bedrockProviderModule);
