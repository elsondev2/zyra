import type { VisualizationInput, VisualizationKind, VisualizationOrigin, VisualizationResource, VisualizationRevision } from './resources.mjs';
export interface VisualizationReviseInput {
  id: string; baseVersion: number; expectedVersion: number; source: string; changeNote?: string;
  title?: string; summary?: string; height?: number; kind?: VisualizationKind;
}
export interface VisualizationStore {
  list(options?: { threadOnly?: boolean; query?: string; metadataOnly?: boolean }): Promise<VisualizationResource[]>;
  getMetadata(id: string): Promise<VisualizationResource | null>;
  get(id: string, version?: number): Promise<(VisualizationResource & { selectedVersion: VisualizationRevision }) | null>;
  create(input: VisualizationInput): Promise<VisualizationResource>;
  revise(input: VisualizationReviseInput): Promise<VisualizationResource>;
  importLegacy(input: VisualizationInput & { origin: VisualizationOrigin; createdAt?: string }): Promise<VisualizationResource>;
}
export const MAX_VISUALIZATION_MANIFEST_BYTES: number;
export const MAX_VISUALIZATION_PROJECT_BYTES: number;
export const MAX_VISUALIZATION_RESOURCES: number;
export const VISUALIZATION_LOCK_STALE_MS: number;
export function createVisualizationStore(context: { cwd: string; threadId: string }): VisualizationStore;
