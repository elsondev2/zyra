import { createPlatformClipboard } from './platform-clipboard.js';
export type ClipboardModule = ReturnType<typeof createPlatformClipboard>;
export declare function loadClipboardNative(): ClipboardModule | null;
export declare const clipboard: {
    getText(): Promise<string>;
    setText(text: string): Promise<void>;
    hasImage(): Promise<boolean>;
    getImageBinary(): Promise<Buffer>;
} | null;
