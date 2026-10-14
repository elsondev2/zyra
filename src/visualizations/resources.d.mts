export type VisualizationKind = 'html' | 'mermaid' | 'scene3d';
export type Vector3 = [number, number, number];
export interface Scene3DObject {
  id: string; type: 'box' | 'sphere' | 'pyramid' | 'cylinder' | 'torus' | 'group'; name?: string;
  position?: Vector3; rotation?: Vector3; scale?: Vector3; color?: string; opacity?: number;
  parentId?: string; size?: Vector3; radius?: number; height?: number;
}
export interface Scene3D { schemaVersion: 1; camera?: { position?: Vector3; target?: Vector3 }; objects: Scene3DObject[]; background?: string; grid?: boolean }
export interface VisualizationOrigin { threadId: string; messageId: string; offset: number; turnId?: string }
export interface VisualizationRevision {
  version: number; parentVersion: number | null; source: string; title: string; summary: string;
  createdAt: string; changeNote: string; height: number; origin?: VisualizationOrigin;
}
export interface VisualizationResource {
  id: string; title: string; kind: VisualizationKind; summary: string; threadId: string;
  createdAt: string; updatedAt: string; latestVersion: number; versions: VisualizationRevision[];
  /** IPC list projection may omit source until details are requested. */
  sourceLoaded?: boolean;
}
export interface VisualizationInput { kind: VisualizationKind; title: string; summary?: string; source: string; height?: number }
export interface VisualizationReferenceText { kind: 'text'; text: string; start: number }
export interface VisualizationReference { kind: 'reference'; id: string; version: number | undefined; start: number; state: 'complete' | 'incomplete' }
export interface LegacyVisualizationSource { kind: 'html' | 'mermaid'; title: string; summary: string; source: string; height: number; offset: number }
export const MAX_VISUALIZATION_SOURCE: number;
export const MAX_VISUALIZATION_REVISIONS: number;
export const VISUALIZATION_KINDS: readonly VisualizationKind[];
export const VISUALIZATION_ID_PATTERN: RegExp;
export function validateVisualizationTimestamp(value: string): string;
export function validateVisualizationResource(value: unknown, options?: { metadataOnly?: boolean }): VisualizationResource;
export function validateVisualizationId(id: string): string;
export function validateVisualizationVersion(version: number): number;
export function validateScene3D(source: string | Scene3D): Scene3D;
export function validateVisualizationSource(kind: VisualizationKind, source: string, options?: { legacy?: boolean }): string;
export function normalizeVisualizationInput(input: VisualizationInput, options?: { legacy?: boolean }): Required<VisualizationInput>;
export function embedVisualizationReference(id: string, version: number): string;
export function parseVisualizationReferences(value: unknown): Array<VisualizationReferenceText | VisualizationReference>;
export function extractLegacyVisualizationSources(value: unknown): LegacyVisualizationSource[];
