export const MAX_VISUALIZATION_HTML: number;
export type VisualizationBlock = { kind: 'visualization'; start: number; title: string; summary: string; height: number; state: 'complete' | 'incomplete' | 'too-large'; html: string };
export type VisualizationPart = VisualizationBlock | { kind: 'text'; start: number; text: string };
export function parseVisualizationBlocks(content: string): VisualizationPart[];
export function visualizationTerminalText(content: string, streaming?: boolean): string;
