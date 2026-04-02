export const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Produce a resource name by concatenating the stack name and parts with hyphens, all lowercase.
 * Validates that all inputs conform to the allowed naming pattern.
 * @throws Error if any part does not match /^[a-z0-9]+(-[a-z0-9]+)*$/
 */
export function resourceName(stackName: string, ...parts: string[]): string {
  const allParts = [stackName, ...parts];

  for (const part of allParts) {
    if (!NAME_PATTERN.test(part)) {
      throw new Error(
        `Invalid name part "${part}". All parts must match pattern: ${NAME_PATTERN}`,
      );
    }
  }

  return allParts.join("-");
}
