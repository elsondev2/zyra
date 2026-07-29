export const PI_SUPPORT_PENDING_STATUS = "pi-support-pending";

export function applyModelCompatibility(model, compatibility) {
  if (!compatibility) return model;
  return {
    ...model,
    zyraCompatibility: { ...compatibility },
  };
}

export function isPiSupportPending(model) {
  return model?.zyraCompatibility?.status === PI_SUPPORT_PENDING_STATUS;
}

export function getModelCompatibilityLabel(model) {
  if (isPiSupportPending(model)) return "Pi support pending";
  return undefined;
}

export function getModelCompatibilityError(model) {
  if (!isPiSupportPending(model)) return undefined;
  return `${model.provider}/${model.id} is wired into Zyra, but the installed Pi runtime does not officially support its Codex transport yet.`;
}
