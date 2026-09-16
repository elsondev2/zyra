export const MAX_PROMPT_IMAGES: number;
export const MAX_PROMPT_IMAGE_BYTES: number;
export const MAX_PROMPT_IMAGE_TOTAL_BYTES: number;
export function detectPromptImageMimeType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null;
export function normalizePromptImages(value: unknown, limits?: { imageBytes?: number; totalBytes?: number }): Array<{type: 'image'; data: string; mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'}> | undefined;
