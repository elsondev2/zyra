import { Stack, type StackChild, type StackOptions } from "./stack.js";
export declare class HStack extends Stack {
    protected readonly layoutType: "hstack";
    constructor(children?: StackChild[], options?: StackOptions);
    render(width: number): string[];
}
