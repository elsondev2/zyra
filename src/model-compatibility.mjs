export const TRANSPORT_SUPPORT_PENDING_STATUS = "transport-support-pending";

export function applyModelCompatibility(model, compatibility) {
  if (!compatibility) return model;
  return {
    ...model,
    zyraCompatibility: { ...compatibility },
  };
}

export function isTransportSupportPending(model) {
  return model?.zyraCompatibility?.status === TRANSPORT_SUPPORT_PENDING_STATUS;
}

export function getModelCompatibilityLabel(model) {
  if (isTransportSupportPending(model)) return "Transport support pending";
  return undefined;
}

export function getModelCompatibilityError(model) {
  if (!isTransportSupportPending(model)) return undefined;
  return `${model.provider}/${model.id} is wired into Zyra, but the Zyra transport does not support its Codex transport yet.`;
}
