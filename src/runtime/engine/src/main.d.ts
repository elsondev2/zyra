/**
 * Main entry point for the coding agent CLI.
 *
 * This file handles CLI argument parsing and translates them into
 * createAgentSession() options. The SDK does the heavy lifting.
 */
import { type Args } from "./cli/args.js";
import type { InlineExtension } from "./core/extensions/types.js";
import { SessionManager } from "./core/session-manager.js";
import { SettingsManager } from "./core/settings-manager.js";
export declare function createSessionManager(parsed: Args, cwd: string, sessionDir: string | undefined, settingsManager: SettingsManager): Promise<SessionManager>;
export interface MainOptions {
    extensionFactories?: InlineExtension[];
}
export declare function main(args: string[], options?: MainOptions): Promise<void>;
