export interface MobileVoiceApi {
  dictation?: { state(): Promise<{ available: boolean; signedIn: boolean; message?: string | null }>; transcribe(input: { audioBase64: string; mimeType: 'audio/wav'; sampleRateHz: 24000; durationMs: number }, signal: AbortSignal): Promise<string> };
  start(session: string, input: { sdp: string; voice?: string }, signal: AbortSignal): Promise<any>;
  ingest(adapterSessionId: string, payload: Record<string, unknown>): Promise<unknown>;
  message(input: { text: string; clientMessageId: string; clientMessageCreatedAt: string }): Promise<unknown>;
  transcribe?(input: { audioBase64: string; mimeType: 'audio/wav'; sampleRateHz: 24000; durationMs: number }, signal: AbortSignal): Promise<string>;
  stop(): Promise<unknown>;
  subscribe(listener: (event: any) => void): () => void;
}
export class MobileVoiceSession {
  readonly supportsDictation: boolean;
  constructor(api: MobileVoiceApi, receive: (payload: Record<string, unknown>) => void);
  dispatch(method: string, params: any, chat: { canonicalChatId: string }): Promise<any>;
  close(): Promise<void>;
  detach(attachment: string): Promise<void>;
}
