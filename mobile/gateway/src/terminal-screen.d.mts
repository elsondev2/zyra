export class TerminalScreen {
  constructor(cols?: number, rows?: number, flow?: (paused: boolean) => void);
  write(data: string): number;
  resize(cols: number, rows: number): void;
  snapshot(): Promise<{ cols: number; rows: number; sequence: number; data: string }>;
  clear(): void;
  dispose(): void;
}
