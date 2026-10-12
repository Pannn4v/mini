/**
 * Sovereign Spintax Compiler
 * Parses spintax patterns like {Hi|Hello|Hey} and variable replacements like {first_name}.
 */

export function parseSpintax(template: string, vars: Record<string, string> = {}): string {
  if (!template) return "";

  // 1. Recursive spintax resolution: {option1|option2|option3}
  let result = template;
  const spintaxRegex = /\{([^{}]+)\}/g;

  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (match, choicesStr) => {
      // Check if it's a variable like {first_name} without pipes
      if (!choicesStr.includes("|")) {
        const key = choicesStr.trim();
        return vars[key] !== undefined ? vars[key] : match;
      }
      const choices = choicesStr.split("|");
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      return chosen.trim();
    });
  }

  // 2. Variable replacement for remaining single variables
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), val || "");
  }

  return result;
}
