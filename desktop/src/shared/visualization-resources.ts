export {
    validateScene3D,
    embedVisualizationReference,
    parseVisualizationReferences,
    extractLegacyVisualizationSources,
    type VisualizationResource,
    type VisualizationRevision,
    type VisualizationKind,
    type Scene3D,
    type Scene3DObject
} from '../../../src/visualizations/resources.mjs'

export type ListVisualizationsInput = { threadId: string; scope?: 'thread' | 'project'; indexOlder?: boolean }
export type GetVisualizationInput = { threadId: string; id: string; version?: number }

export const VISUALIZATION_USE_EVENT = 'zyra:use-visualization'
export type VisualizationUseDetail = {
    threadId: string
    id: string
    version: number
    title: string
    kind: 'html' | 'mermaid' | 'scene3d'
}
