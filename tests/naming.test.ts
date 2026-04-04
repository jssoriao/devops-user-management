import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import { NAME_PATTERN, resourceName } from "../src/naming";
import { validName } from "./arbitraries";

describe("naming convention", () => {
  it("output matches /^[a-z0-9]+(-[a-z0-9]+)*$/ and starts with stack name", () => {
    fc.assert(
      fc.property(
        validName,
        fc.array(validName, { minLength: 0, maxLength: 4 }),
        (stackName, parts) => {
          const result = resourceName(stackName, ...parts);

          // Output must match the naming pattern
          expect(result).toMatch(NAME_PATTERN);

          // Output must start with the stack name
          expect(result.startsWith(stackName)).toBe(true);

          // Output must be the concatenation of stack name and parts with hyphens
          const expected = [stackName, ...parts].join("-");
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("throws on invalid stack name", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 10 })
          .filter((s) => !NAME_PATTERN.test(s)),
        validName,
        (invalidStack, part) => {
          expect(() => resourceName(invalidStack, part)).toThrow(
            /Invalid name part/,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("throws on invalid part", () => {
    fc.assert(
      fc.property(
        validName,
        fc
          .string({ minLength: 1, maxLength: 10 })
          .filter((s) => !NAME_PATTERN.test(s)),
        (stackName, invalidPart) => {
          expect(() => resourceName(stackName, invalidPart)).toThrow(
            /Invalid name part/,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
