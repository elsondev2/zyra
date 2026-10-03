export function defineZyraTool(tool) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
    throw new TypeError("A Zyra tool definition must be an object.");
  }
  for (const field of ["name", "label", "description"]) {
    if (typeof tool[field] !== "string" || !tool[field].trim()) {
      throw new TypeError(`A Zyra tool definition needs a non-empty ${field}.`);
    }
  }
  if (!tool.parameters || typeof tool.parameters !== "object" || Array.isArray(tool.parameters)) {
    throw new TypeError("A Zyra tool definition needs an object parameter schema.");
  }
  if (typeof tool.execute !== "function") {
    throw new TypeError("A Zyra tool definition needs an execute function.");
  }
  return tool;
}
