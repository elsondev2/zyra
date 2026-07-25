export function evaluateWorkflowApproval(definition, options = {}) {
  const source = definition?.origin ?? definition?.source ?? "temporary";
  const projectLocal = source === "project";
  const generated = definition?.temporary === true || source === "temporary";
  const inherentlyTrusted = definition?.trusted !== false && !generated && (!projectLocal || options.projectTrusted === true);
  const approved = options.approved === true || inherentlyTrusted;
  const warnings = [];
  if (projectLocal && options.projectTrusted !== true) warnings.push("Project workflow requires project trust.");
  if (generated) warnings.push("Temporary generated workflow requires explicit approval for this run.");
  return {
    required: !inherentlyTrusted,
    approved,
    source,
    warnings,
  };
}

export function assertWorkflowApproved(definition, options = {}) {
  const approval = evaluateWorkflowApproval(definition, options);
  if (approval.required && !approval.approved) {
    const error = new Error(approval.warnings.join(" ") || "Workflow approval is required.");
    error.code = "WORKFLOW_APPROVAL_REQUIRED";
    error.approval = approval;
    throw error;
  }
  return approval;
}
