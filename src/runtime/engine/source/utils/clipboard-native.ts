import { createPlatformClipboard } from './platform-clipboard.ts';
export type ClipboardModule = ReturnType<typeof createPlatformClipboard>;
export function loadClipboardNative(): ClipboardModule | null { return createPlatformClipboard(); }
export const clipboard = process.env.TERMUX_VERSION ? null : loadClipboardNative();
