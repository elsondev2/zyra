type Execute = (command: string, args: string[], input?: string) => Promise<Buffer>;
/** Platform clipboard commands. No downloaded clipboard addon or package lookup. */
export declare function createPlatformClipboard(options?: {
    platform?: string;
    env?: NodeJS.ProcessEnv;
    execute?: Execute;
}): {
    getText(): Promise<string>;
    setText(text: string): Promise<void>;
    hasImage(): Promise<boolean>;
    getImageBinary(): Promise<Buffer>;
};
export {};
