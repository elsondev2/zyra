/**
 * Kimi Code (subscription) OAuth flow
 *
 * RFC 8628 device authorization grant against https://auth.kimi.com with JSON
 * responses. The access token authenticates requests to
 * https://api.kimi.com/coding as an `Authorization: Bearer` header.
 */
import type { OAuthAuth } from "../types.js";
export declare const kimiCodingOAuth: OAuthAuth;
