import { Type } from 'typebox';
import path from 'node:path';
import { defineZyraTool } from '../agents/define-zyra-tool.mjs';
import { createVisualizationStore } from './store.mjs';
import { embedVisualizationReference, validateVisualizationVersion } from './resources.mjs';
import { ZYRA_VISUALIZATION_TOOL_NAME } from '../tool-contracts.mjs';

const vector = Type.Tuple([Type.Number(), Type.Number(), Type.Number()]);
const sceneParameters = Type.Object({
  schemaVersion: Type.Literal(1),
  camera: Type.Optional(Type.Object({ position: Type.Optional(vector), target: Type.Optional(vector) }, { additionalProperties: false })),
  background: Type.Optional(Type.String({ pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' })),
  grid: Type.Optional(Type.Boolean()),
  objects: Type.Array(Type.Object({
    id: Type.String({ pattern: '^[a-zA-Z0-9_-]{1,64}$' }),
    type: Type.Union(['box', 'sphere', 'pyramid', 'cylinder', 'torus', 'group'].map(value => Type.Literal(value))),
    name: Type.Optional(Type.String({ maxLength: 160 })),
    position: Type.Optional(vector), rotation: Type.Optional(vector), scale: Type.Optional(vector), size: Type.Optional(vector),
    color: Type.Optional(Type.String({ pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' })),
    opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    parentId: Type.Optional(Type.String({ maxLength: 64 })),
    radius: Type.Optional(Type.Number({ minimum: 0.001, maximum: 1000 })),
    height: Type.Optional(Type.Number({ minimum: 0.001, maximum: 1000 })),
  }, { additionalProperties: false }), { maxItems: 128 }),
}, { additionalProperties: false });

export function createVisualizationTool({ getContext, authorize } = {}) {
  if (typeof getContext !== 'function') throw new Error('Visualization tool needs trusted session context.');
  if (typeof authorize !== 'function') throw new Error('Visualization tool needs a trusted permission authorizer.');
  return defineZyraTool({
    name: ZYRA_VISUALIZATION_TOOL_NAME, label: 'Saved visualization',
    description: 'Save and revise project-local HTML, Mermaid and declarative 3D visualization resources. Actions list/read/embed are read-only; create/revise write durable immutable revisions. Read first before editing. revise requires baseVersion (branch parent) and expectedVersion (current latest optimistic concurrency guard). Use source for HTML/Mermaid. For 3D, prefer the typed scene object parameter instead of double-encoding JSON; provide either scene or source, not both. read returns selectedVersion source, sourceFile, and revision metadata without repeating every historical source. Source must be scriptless, self-contained and at most 64 KiB. scene3d uses schemaVersion:1, optional camera position/target, objects with unique id and type box/sphere/pyramid/cylinder/torus/group, optional name/position/rotation/scale/color/opacity/parentId/size/radius/height, optional background/grid. Rotations are radians. Vectors have three finite numbers; colors are #RGB/#RRGGBB; parents are groups; maximum 128 objects. embed requires an explicit pinned version and returns a <visualization-ref id="uuid" version="1" /> line to emit outside code fences. No arbitrary filesystem root or thread identity can be supplied.',
    parameters: Type.Object({
      action: Type.Union(['list', 'read', 'create', 'revise', 'embed'].map(value => Type.Literal(value))),
      id: Type.Optional(Type.String()), version: Type.Optional(Type.Integer({ minimum: 1 })),
      kind: Type.Optional(Type.Union(['html', 'mermaid', 'scene3d'].map(value => Type.Literal(value)))),
      title: Type.Optional(Type.String({ maxLength: 160 })), summary: Type.Optional(Type.String({ maxLength: 1200 })),
      source: Type.Optional(Type.String({ maxLength: 65536 })),
      scene: Type.Optional(sceneParameters),
      height: Type.Optional(Type.Integer({ minimum: 160, maximum: 640 })),
      baseVersion: Type.Optional(Type.Integer({ minimum: 1 })), expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
      changeNote: Type.Optional(Type.String({ maxLength: 1200 })), threadOnly: Type.Optional(Type.Boolean()), query: Type.Optional(Type.String({ maxLength: 1200 })),
    }, { additionalProperties: false }),
    execute: async (toolCallId, params) => {
      const context = await getContext();
      // Tool-local preflight is mandatory, even when the generic SDK gate is absent.
      const permission = await authorize(context, params.action === 'revise' ? 'read' : params.action, toolCallId);
      if (permission === false || permission?.block === true) throw new Error(permission?.reason || 'Visualization access denied.');
      const store = createVisualizationStore({ cwd: context.cwd, threadId: context.threadId });
      // Saved Projects use a stable home. Explicit references can also resolve
      // CLI artifacts in associated workspaces, without enumerating those roots.
      const existing = async (id, version) => {
        const roots = [...new Set([context.cwd, ...(Array.isArray(context.readRoots) ? context.readRoots : [])])].slice(0, 20);
        for (const cwd of roots) {
          if (typeof cwd !== 'string' || !cwd) continue;
          const candidateContext = { ...context, cwd };
          if (cwd !== context.cwd) {
            const access = await authorize(candidateContext, 'read', toolCallId);
            if (access === false || access?.block === true) continue;
          }
          const candidate = cwd === context.cwd ? store : createVisualizationStore(candidateContext);
          const resource = await candidate.get(id, version);
          if (resource) return { resource, store: candidate, context: candidateContext };
        }
        throw new Error('Visualization does not exist in this Project or workspace.');
      };
      const sourceFor = kind => {
        if (params.scene !== undefined) {
          if (kind !== 'scene3d') throw new Error('scene is supported only for scene3d resources.');
          if (params.source !== undefined) throw new Error('Provide either source or scene, not both.');
          return JSON.stringify(params.scene);
        }
        return params.source;
      };
      let result;
      switch (params.action) {
        case 'list': {
          const resources = await store.list({ threadOnly: params.threadOnly, query: params.query });
          result = resources.map(({ versions, ...resource }) => ({ ...resource, versionCount: versions.length })); break;
        }
        case 'read': {
          const resolved = await existing(params.id, params.version);
          const resource = resolved.resource;
          const { versions, selectedVersion, ...metadata } = resource;
          const extension = { html: 'html', mermaid: 'mmd', scene3d: 'json' }[resource.kind];
          result = { ...metadata,
            sourceFile: path.join(resolved.context.cwd, '.zyra', 'visualizations', resource.id, `v${selectedVersion.version}.${extension}`),
            selectedVersion, versions: versions.map(({ source, ...revision }) => revision) };
          break;
        }
        case 'create': {
          const kind = params.kind ?? (params.scene !== undefined ? 'scene3d' : undefined);
          const { versions, ...metadata } = await store.create({ kind, title: params.title, summary: params.summary, source: sourceFor(kind), height: params.height });
          result = { ...metadata, versionCount: versions.length, embed: embedVisualizationReference(metadata.id, metadata.latestVersion) };
          break;
        }
        case 'revise': {
          const resolved = await existing(params.id);
          const access = await authorize(resolved.context, 'revise', toolCallId);
          if (access === false || access?.block === true) throw new Error(access?.reason || 'Visualization revision access denied.');
          const { versions, ...metadata } = await resolved.store.revise({ id: params.id, baseVersion: params.baseVersion, expectedVersion: params.expectedVersion, source: sourceFor(resolved.resource.kind), kind: params.kind, title: params.title, summary: params.summary, height: params.height, changeNote: params.changeNote });
          result = { ...metadata, versionCount: versions.length, parentVersion: params.baseVersion, embed: embedVisualizationReference(metadata.id, metadata.latestVersion) };
          break;
        }
        case 'embed': {
          validateVisualizationVersion(params.version);
          const { resource } = await existing(params.id, params.version);
          result = { id: resource.id, version: params.version, embed: embedVisualizationReference(resource.id, params.version) }; break;
        }
        default: throw new Error('Unknown visualization action.');
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { visualization: true, action: params.action } };
    },
  });
}
