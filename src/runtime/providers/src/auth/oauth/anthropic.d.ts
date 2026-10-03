/**
 * Anthropic OAuth flow (Claude Pro/Max)
 *
 * NOTE: This module uses Node.js http.createServer for the OAuth callback server.
 * It is only intended for CLI use, not browser environments.
 */
import type { OAuthAuth } from "../types.js";
export declare const anthropicOAuth: OAuthAuth;
