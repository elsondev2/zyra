export async function copyPreviewPath(path: string, write: (text: string) => Promise<{ success: boolean }>): Promise<boolean> {
    try { return (await write(path)).success === true } catch { return false }
}
