/** Small model metadata, using the same branch inheritance as Pi's session context. */
export const MODEL_PRESENTATION_VERSION = 1;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function clean(value) {
  return typeof value === 'string' && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
}
export function normalizeChatModel(value, provider = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    provider = value.provider || provider;
    value = value.id || value.modelId;
  }
  const id = clean(value), prefix = clean(provider);
  if (!id) return null;
  return prefix && !id.startsWith(prefix + '/') ? prefix + '/' + id : id;
}
export function entryChatModel(entry) {
  if (entry?.type === 'model_change') return normalizeChatModel(entry.modelId, entry.provider);
  if (entry?.type === 'message' && entry.message?.role === 'assistant') return normalizeChatModel(entry.message.model, entry.message.provider);
  return null;
}
export function newModelPresentation() {
  return { modelPresentationVersion: MODEL_PRESENTATION_VERSION, model: null, modelNames: [null], modelLineage: Object.create(null), modelLeaf: 0 };
}
export function applyEntryModel(record, entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
  if (entry?.type === 'session' || record.modelPresentationVersion !== MODEL_PRESENTATION_VERSION) return;
  const lineage = record.modelLineage, names = record.modelNames;
  if (!lineage || !Array.isArray(names)) return;
  // Explicit null starts a new root; missing parentId is the legacy linear format.
  const parent = clean(entry?.parentId);
  let index = own(entry, 'parentId') ? (parent && own(lineage, parent) ? lineage[parent] : 0) : (record.modelLeaf || 0);
  const model = entryChatModel(entry);
  if (model) {
    index = names.indexOf(model);
    if (index < 0) { index = names.length; names.push(model); }
  }
  const id = clean(entry?.id);
  if (id) Object.defineProperty(lineage, id, { value: index, enumerable: true, writable: true, configurable: true });
  record.modelLeaf = index;
  record.model = names[index] || null;
}
