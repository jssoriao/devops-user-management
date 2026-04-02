import { describe, it, expect } from "vitest";
import { dump as yamlDump } from "js-yaml";
import * as fc from "fast-check";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

import {
  loadConfig,
  validateConfig,
  UsersConfig,
  UserEntry,
} from "../src/config";
import { validName } from "./arbitraries";

// -- Test arbitraries --

const validUserEntry: fc.Arbitrary<UserEntry> = fc.record({
  name: validName,
  github_team: validName,
  aws_account: validName,
});

/** UsersConfig with unique user names */
const validUsersConfig: fc.Arbitrary<UsersConfig> = fc
  .array(validUserEntry, { minLength: 1, maxLength: 10 })
  .map((users) => {
    const seen = new Set<string>();
    const unique = users.filter((u) => {
      if (seen.has(u.name)) return false;
      seen.add(u.name);
      return true;
    });
    return { users: unique.length > 0 ? unique : [users[0]] };
  });

/** Name containing at least one invalid character */
const invalidName = fc.oneof(
  fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /[A-Z]/.test(s)),
  validName.map((n) => n + "!"),
  validName.map((n) => n + " x"),
  validName.map((n) => "-" + n),
  validName.map((n) => n + "-"),
  fc.constant(""),
);

// -- Helpers --

function writeTempFile(content: string): string {
  const tmpFile = path.join(
    os.tmpdir(),
    `test-config-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
  );
  fs.writeFileSync(tmpFile, content, "utf-8");
  return tmpFile;
}

// =============================================================================
// loadConfig: YAML file parsing and structural validation
// =============================================================================

describe("loadConfig", () => {
  // -- Property 1: Config loading round-trip --
  // Feature: devops-user-management, Property 1: Config loading round-trip
  // Validates: Requirements 1.1
  it("round-trips valid config through YAML serialize/deserialize", () => {
    fc.assert(
      fc.property(validUsersConfig, (config) => {
        const tmpFile = writeTempFile(yamlDump(config));
        try {
          const loaded = loadConfig(tmpFile);
          expect(loaded.users.length).toBe(config.users.length);
          for (let i = 0; i < config.users.length; i++) {
            expect(loaded.users[i].name).toBe(config.users[i].name);
            expect(loaded.users[i].github_team).toBe(
              config.users[i].github_team,
            );
            expect(loaded.users[i].aws_account).toBe(
              config.users[i].aws_account,
            );
          }
        } finally {
          fs.unlinkSync(tmpFile);
        }
      }),
      { numRuns: 100 },
    );
  });

  // -- Failure cases: file system and YAML structure errors --
  it("throws when file does not exist", () => {
    expect(() => loadConfig("/nonexistent/path/users.yaml")).toThrow(
      /Configuration file not found/,
    );
  });

  it("throws on invalid YAML syntax", () => {
    const tmpFile = writeTempFile("users:\n  - name: alice\n    bad_indent");
    try {
      expect(() => loadConfig(tmpFile)).toThrow(
        /Invalid YAML|Invalid configuration/,
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("throws when YAML has no users array", () => {
    const tmpFile = writeTempFile("teams:\n  - backend\n  - frontend");
    try {
      expect(() => loadConfig(tmpFile)).toThrow(
        /expected an object with a "users" array/,
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("throws when YAML is empty", () => {
    const tmpFile = writeTempFile("");
    try {
      expect(() => loadConfig(tmpFile)).toThrow(
        /expected an object with a "users" array/,
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("throws when users is not an array", () => {
    const tmpFile = writeTempFile("users: not-an-array");
    try {
      expect(() => loadConfig(tmpFile)).toThrow(
        /expected an object with a "users" array/,
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// =============================================================================
// validateConfig: field presence, naming pattern, and uniqueness checks
// =============================================================================

describe("validateConfig", () => {
  // -- Property 4: Validation rejects invalid input (property-based) --
  // Feature: devops-user-management, Property 4: Config validation rejects invalid input
  // Validates: Requirements 1.4, 1.5, 6.3

  it("rejects random entries with missing name (property)", () => {
    fc.assert(
      fc.property(validName, validName, (githubTeam, awsAccount) => {
        const config: UsersConfig = {
          users: [
            {
              name: undefined as any,
              github_team: githubTeam,
              aws_account: awsAccount,
            },
          ],
        };
        expect(() => validateConfig(config)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("rejects random entries with missing github_team (property)", () => {
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

  it("rejects random entries with missing aws_account (property)", () => {
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

  it("rejects random entries with invalid characters in name (property)", () => {
    fc.assert(
      fc.property(
        invalidName,
        validName,
        validName,
        (name, githubTeam, awsAccount) => {
          const config: UsersConfig = {
            users: [{ name, github_team: githubTeam, aws_account: awsAccount }],
          };
          expect(() => validateConfig(config)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects random configs with duplicate user names (property)", () => {
    fc.assert(
      fc.property(
        validName,
        validName,
        validName,
        (name, githubTeam, awsAccount) => {
          const config: UsersConfig = {
            users: [
              { name, github_team: githubTeam, aws_account: awsAccount },
              { name, github_team: githubTeam, aws_account: awsAccount },
            ],
          };
          expect(() => validateConfig(config)).toThrow(/[Dd]uplicate/);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -- Edge cases: specific naming pattern violations --

  it("throws on name starting with hyphen", () => {
    const config: UsersConfig = {
      users: [{ name: "-alice", github_team: "backend", aws_account: "dev" }],
    };
    expect(() => validateConfig(config)).toThrow(/invalid name/i);
  });

  it("throws on name ending with hyphen", () => {
    const config: UsersConfig = {
      users: [{ name: "alice-", github_team: "backend", aws_account: "dev" }],
    };
    expect(() => validateConfig(config)).toThrow(/invalid name/i);
  });

  it("throws on uppercase characters in name", () => {
    const config: UsersConfig = {
      users: [{ name: "Alice", github_team: "backend", aws_account: "dev" }],
    };
    expect(() => validateConfig(config)).toThrow(/invalid name/i);
  });

  it("throws on special characters in name", () => {
    const config: UsersConfig = {
      users: [{ name: "alice!", github_team: "backend", aws_account: "dev" }],
    };
    expect(() => validateConfig(config)).toThrow(/invalid name/i);
  });
});
