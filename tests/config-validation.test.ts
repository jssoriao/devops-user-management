import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateConfig, UsersConfig } from "../src/config";

// Feature: devops-user-management, Property 4: Config validation rejects invalid input
// **Validates: Requirements 1.4, 1.5, 6.3**

/** A valid name segment for building otherwise-valid user entries */
const validNameSegment = fc.string({
  unit: fc.mapToConstant(
    { num: 26, build: (v) => String.fromCharCode(97 + v) }, // a-z
    { num: 10, build: (v) => String.fromCharCode(48 + v) }, // 0-9
  ),
  minLength: 1,
  maxLength: 8,
});

const validName = fc
  .array(validNameSegment, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("-"));

/**
 * Generate a name that contains at least one invalid character
 * (uppercase, special chars, spaces, leading/trailing hyphens, consecutive hyphens)
 */
const invalidName = fc.oneof(
  // Name with uppercase letters
  fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /[A-Z]/.test(s) && s.length > 0),
  // Name with special characters
  validName.map((n) => n + "!"),
  // Name with spaces
  validName.map((n) => n + " x"),
  // Name starting with hyphen
  validName.map((n) => "-" + n),
  // Name ending with hyphen
  validName.map((n) => n + "-"),
  // Empty string
  fc.constant(""),
);

describe("Property 4: Config validation rejects invalid input", () => {
  it("rejects user entries with missing name field", () => {
    fc.assert(
      fc.property(validName, validName, (githubTeam, awsAccount) => {
        const config: UsersConfig = {
          users: [
            { name: undefined as any, github_team: githubTeam, aws_account: awsAccount },
          ],
        };
        expect(() => validateConfig(config)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user entries with missing github_team field", () => {
    fc.assert(
      fc.property(validName, validName, (name, awsAccount) => {
        const config: UsersConfig = {
          users: [
            { name, github_team: undefined as any, aws_account: awsAccount },
          ],
        };
        expect(() => validateConfig(config)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user entries with missing aws_account field", () => {
    fc.assert(
      fc.property(validName, validName, (name, githubTeam) => {
        const config: UsersConfig = {
          users: [
            { name, github_team: githubTeam, aws_account: undefined as any },
          ],
        };
        expect(() => validateConfig(config)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user entries with invalid characters in name", () => {
    fc.assert(
      fc.property(invalidName, validName, validName, (name, githubTeam, awsAccount) => {
        const config: UsersConfig = {
          users: [
            { name, github_team: githubTeam, aws_account: awsAccount },
          ],
        };
        expect(() => validateConfig(config)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("rejects configs with duplicate user names", () => {
    fc.assert(
      fc.property(validName, validName, validName, (name, githubTeam, awsAccount) => {
        const config: UsersConfig = {
          users: [
            { name, github_team: githubTeam, aws_account: awsAccount },
            { name, github_team: githubTeam, aws_account: awsAccount },
          ],
        };
        expect(() => validateConfig(config)).toThrow(/[Dd]uplicate/);
      }),
      { numRuns: 100 },
    );
  });
});
