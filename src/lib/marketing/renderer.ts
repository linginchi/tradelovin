export type TemplateVariables = Record<string, string | number>;

export function renderTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}
