import { describe, it, expect } from "vitest";
import { dump as yamlDump } from "js-yaml";
import * as fc from "fast-check";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

import { loadConfig, validateConfig, UsersConfig } from "../src/config";
import { validName, validUsersConfig, invalidName } from "./arbitraries";

// -- Helpers --

function writeTempFile(content: string): string {
  const tmpFile = path.join(
    os.tmpdir(),
    `test-config-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
  );
  fs.writeFileSync(tmpFile, content, "utf-8");
  return tmpFile;
}

function makeMinimalConfig(overrides?: Partial<UsersConfig>): UsersConfig {
  return {
    aws_accounts: [{ name: "dev" }],
    github_teams: [{ name: "backend" }],
    iam_groups: [{ name: "developers", account: "dev" }],
    users: [
      {
        name: "alice",
        github: { team: "backend" },
        iam_assignments: [{ account: "dev", iam_group: "developers" }],
      },
    ],
    ...overrides,
  };
}

// =============================================================================
// loadConfig: YAML file parsing and structural validation
// =============================================================================

describe("loadConfig", () => {
  // Feature: pulumi-user-management, Property 1: Config loading round-trip
  // Validates: Requirements 1.1, 1.2, 1.3
  it("round-trips valid four-section config through YAML serialize/deserialize", () => {
    fc.assert(
      fc.property(validUsersConfig, (config) => {
        const tmpFile = writeTempFile(yamlDump(config));
        try {
          const loaded = loadConfig(tmpFile);
          expect(loaded.aws_accounts.length).toBe(config.aws_accounts.length);
          expect(loaded.github_teams.length).toBe(config.github_teams.length);
          expect(loaded.iam_groups.length).toBe(config.iam_groups.length);
          expect(loaded.users.length).toBe(config.users.length);
          for (let i = 0; i < config.users.length; i++) {
            expect(loaded.users[i].name).toBe(config.users[i].name);
            expect(loaded.users[i].github.team).toBe(
              config.users[i].github.team,
            );
            expect(loaded.users[i].iam_assignments).toEqual(
              config.users[i].iam_assignments,
            );
          }
        } finally {
          fs.unlinkSync(tmpFile);
        }
      }),
      { numRuns: 100 },
    );
  });

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

  it("throws when YAML is empty", () => {
    const tmpFile = writeTempFile("");
    try {
      expect(() => loadConfig(tmpFile)).toThrow(/Invalid configuration/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("throws when aws_accounts section is missing", () => {
    const tmpFile = writeTempFile(
      yamlDump({
        github_teams: [{ name: "backend" }],
        iam_groups: [{ name: "dev", account: "dev" }],
        users: [],
      }),
    );
    try {
      expect(() => loadConfig(tmpFile)).toThrow(/aws_accounts/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("throws when github_teams section is missing", () => {
    const tmpFile = writeTempFile(
      yamlDump({
        aws_accounts: [{ name: "dev" }],
        iam_groups: [{ name: "dev", account: "dev" }],
        users: [],
      }),
    );
    try {
      expect(() => loadConfig(tmpFile)).toThrow(/github_teams/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("throws when iam_groups section is missing", () => {
    const tmpFile = writeTempFile(
      yamlDump({
        aws_accounts: [{ name: "dev" }],
        github_teams: [{ name: "backend" }],
        users: [],
      }),
    );
    try {
      expect(() => loadConfig(tmpFile)).toThrow(/iam_groups/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("throws when users section is missing", () => {
    const tmpFile = writeTempFile(
      yamlDump({
        aws_accounts: [{ name: "dev" }],
        github_teams: [{ name: "backend" }],
        iam_groups: [{ name: "dev", account: "dev" }],
      }),
    );
    try {
      expect(() => loadConfig(tmpFile)).toThrow(/users/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// =============================================================================
// validateConfig: field presence, naming pattern, and uniqueness checks
// =============================================================================

describe("validateConfig", () => {
  // Feature: pulumi-user-management, Property 4: Validation rejects missing required fields
  // Validates: Requirements 1.5, 1.6, 1.7, 1.8, 6.5, 7.3

  it("accepts a valid minimal config", () => {
    expect(() => validateConfig(makeMinimalConfig())).not.toThrow();
  });

  it("rejects user with missing name (property)", () => {
    fc.assert(
      fc.property(validName, validName, (team, group) => {
        const config = makeMinimalConfig({
          github_teams: [{ name: team }],
          iam_groups: [{ name: group, account: "dev" }],
          users: [
            {
              name: undefined as any,
              github: { team: team },
              iam_assignments: [{ account: "dev", iam_group: group }],
            },
          ],
        });
        expect(() => validateConfig(config)).toThrow(
          /missing required field "name"/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user with missing github (property)", () => {
    fc.assert(
      fc.property(validName, validName, (name, group) => {
        const config = makeMinimalConfig({
          iam_groups: [{ name: group, account: "dev" }],
          users: [
            {
              name,
              github: undefined as any,
              iam_assignments: [{ account: "dev", iam_group: group }],
            },
          ],
        });
        expect(() => validateConfig(config)).toThrow(
          /missing required field "github"/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user with missing iam_assignments (property)", () => {
    fc.assert(
      fc.property(validName, (name) => {
        const config = makeMinimalConfig({
          users: [
            {
              name,
              github: { team: "backend" },
              iam_assignments: undefined as any,
            },
          ],
        });
        expect(() => validateConfig(config)).toThrow(/iam_assignments/);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user with empty iam_assignments array", () => {
    const config = makeMinimalConfig({
      users: [{ name: "alice", github: { team: "backend" }, iam_assignments: [] }],
    });
    expect(() => validateConfig(config)).toThrow(/iam_assignments/);
  });

  it("rejects iam_assignment missing account", () => {
    const config = makeMinimalConfig({
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [
            { account: undefined as any, iam_group: "developers" },
          ],
        },
      ],
    });
    expect(() => validateConfig(config)).toThrow(
      /missing required field "account"/,
    );
  });

  it("rejects iam_assignment missing iam_group", () => {
    const config = makeMinimalConfig({
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: undefined as any }],
        },
      ],
    });
    expect(() => validateConfig(config)).toThrow(
      /missing required field "iam_group"/,
    );
  });

  it("rejects aws_account with missing name", () => {
    const config = makeMinimalConfig({
      aws_accounts: [{ name: undefined as any }],
    });
    expect(() => validateConfig(config)).toThrow(
      /AWS account.*missing required field "name"/,
    );
  });

  it("rejects github_team with missing name", () => {
    const config = makeMinimalConfig({
      github_teams: [{ name: undefined as any }],
    });
    expect(() => validateConfig(config)).toThrow(
      /GitHub team.*missing required field "name"/,
    );
  });

  it("rejects iam_group with missing name", () => {
    const config = makeMinimalConfig({
      iam_groups: [{ name: undefined as any, account: "dev" }],
    });
    expect(() => validateConfig(config)).toThrow(
      /IAM group.*missing required field "name"/,
    );
  });

  it("rejects iam_group with missing account", () => {
    const config = makeMinimalConfig({
      iam_groups: [{ name: "developers", account: undefined as any }],
    });
    expect(() => validateConfig(config)).toThrow(
      /IAM group.*missing required field "account"/,
    );
  });

  it("rejects invalid privacy value on github_team", () => {
    const config = makeMinimalConfig({
      github_teams: [{ name: "backend", privacy: "open" as any }],
    });
    expect(() => validateConfig(config)).toThrow(/invalid privacy value/);
  });

  it("rejects invalid characters in user name (property)", () => {
    fc.assert(
      fc.property(invalidName, (name) => {
        const config = makeMinimalConfig({
          users: [
            {
              name,
              github: { team: "backend" },
              iam_assignments: [{ account: "dev", iam_group: "developers" }],
            },
          ],
        });
        expect(() => validateConfig(config)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  // Edge cases for naming pattern
  it("throws on name starting with hyphen", () => {
    const config = makeMinimalConfig({
      users: [
        {
          name: "-alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    });
    expect(() => validateConfig(config)).toThrow(/invalid name/i);
  });

  it("throws on name ending with hyphen", () => {
    const config = makeMinimalConfig({
      users: [
        {
          name: "alice-",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    });
    expect(() => validateConfig(config)).toThrow(/invalid name/i);
  });

  it("throws on uppercase characters in name", () => {
    const config = makeMinimalConfig({
      users: [
        {
          name: "Alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    });
    expect(() => validateConfig(config)).toThrow(/invalid name/i);
  });

  it("throws on special characters in name", () => {
    const config = makeMinimalConfig({
      users: [
        {
          name: "alice!",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    });
    expect(() => validateConfig(config)).toThrow(/invalid name/i);
  });

  // Duplicate checks
  it("rejects duplicate user names", () => {
    const config = makeMinimalConfig({
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    });
    expect(() => validateConfig(config)).toThrow(/[Dd]uplicate user name/);
  });

  it("rejects duplicate aws_account names", () => {
    const config = makeMinimalConfig({
      aws_accounts: [{ name: "dev" }, { name: "dev" }],
    });
    expect(() => validateConfig(config)).toThrow(/[Dd]uplicate AWS account/);
  });

  it("rejects duplicate github_team names", () => {
    const config = makeMinimalConfig({
      github_teams: [{ name: "backend" }, { name: "backend" }],
    });
    expect(() => validateConfig(config)).toThrow(/[Dd]uplicate GitHub team/);
  });

  it("rejects duplicate iam_group name+account pair", () => {
    const config = makeMinimalConfig({
      iam_groups: [
        { name: "developers", account: "dev" },
        { name: "developers", account: "dev" },
      ],
    });
    expect(() => validateConfig(config)).toThrow(/[Dd]uplicate IAM group/);
  });

  it("accepts same iam_group name in different accounts", () => {
    const config = makeMinimalConfig({
      aws_accounts: [{ name: "dev" }, { name: "prod" }],
      iam_groups: [
        { name: "developers", account: "dev" },
        { name: "developers", account: "prod" },
      ],
    });
    expect(() => validateConfig(config)).not.toThrow();
  });
});

// =============================================================================
// Cross-reference validation (Property 5)
// =============================================================================

describe("cross-reference validation", () => {
  // Feature: pulumi-user-management, Property 5: Cross-reference validation rejects unresolved references
  // Validates: Requirements 6.1, 6.2, 6.3, 6.4

  it("rejects user referencing non-existent github team (property)", () => {
    fc.assert(
      fc.property(validName, validName, (userName, badTeam) => {
        fc.pre(badTeam !== "backend"); // ensure it doesn't accidentally match
        const config = makeMinimalConfig({
          users: [
            {
              name: userName,
              github: { team: badTeam },
              iam_assignments: [{ account: "dev", iam_group: "developers" }],
            },
          ],
        });
        expect(() => validateConfig(config)).toThrow(
          /references non-existent GitHub team/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user iam_assignment referencing non-existent account (property)", () => {
    fc.assert(
      fc.property(validName, validName, (userName, badAccount) => {
        fc.pre(badAccount !== "dev");
        const config = makeMinimalConfig({
          users: [
            {
              name: userName,
              github: { team: "backend" },
              iam_assignments: [
                { account: badAccount, iam_group: "developers" },
              ],
            },
          ],
        });
        expect(() => validateConfig(config)).toThrow(
          /references non-existent account/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user iam_assignment referencing group not defined for that account (property)", () => {
    fc.assert(
      fc.property(validName, validName, (userName, badGroup) => {
        fc.pre(badGroup !== "developers");
        const config = makeMinimalConfig({
          users: [
            {
              name: userName,
              github: { team: "backend" },
              iam_assignments: [{ account: "dev", iam_group: badGroup }],
            },
          ],
        });
        expect(() => validateConfig(config)).toThrow(
          /references non-existent IAM group/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rejects iam_groups entry referencing non-existent account (property)", () => {
    fc.assert(
      fc.property(validName, (badAccount) => {
        fc.pre(badAccount !== "dev");
        const config = makeMinimalConfig({
          iam_groups: [{ name: "developers", account: badAccount }],
        });
        expect(() => validateConfig(config)).toThrow(
          /references non-existent account/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rejects user referencing group in wrong account", () => {
    const config = makeMinimalConfig({
      aws_accounts: [{ name: "dev" }, { name: "prod" }],
      iam_groups: [{ name: "developers", account: "dev" }],
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "prod", iam_group: "developers" }],
        },
      ],
    });
    expect(() => validateConfig(config)).toThrow(
      /references non-existent IAM group "developers" in account "prod"/,
    );
  });
});

// =============================================================================
// Duplicate validation (Property 6)
// =============================================================================

describe("duplicate validation (property)", () => {
  // Feature: pulumi-user-management, Property 6: No duplicate names within sections
  // Validates: Requirements 6.6, 6.7, 6.8, 6.9

  it("rejects duplicate account names (property)", () => {
    fc.assert(
      fc.property(validName, (name) => {
        const config: UsersConfig = {
          aws_accounts: [{ name }, { name }],
          github_teams: [{ name: "team" }],
          iam_groups: [{ name: "group", account: name }],
          users: [
            {
              name: "user",
              github: { team: "team" },
              iam_assignments: [{ account: name, iam_group: "group" }],
            },
          ],
        };
        expect(() => validateConfig(config)).toThrow(
          /[Dd]uplicate AWS account/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rejects duplicate team names (property)", () => {
    fc.assert(
      fc.property(validName, (name) => {
        const config: UsersConfig = {
          aws_accounts: [{ name: "dev" }],
          github_teams: [{ name }, { name }],
          iam_groups: [{ name: "group", account: "dev" }],
          users: [
            {
              name: "user",
              github: { team: name },
              iam_assignments: [{ account: "dev", iam_group: "group" }],
            },
          ],
        };
        expect(() => validateConfig(config)).toThrow(
          /[Dd]uplicate GitHub team/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rejects duplicate iam_group name+account pairs (property)", () => {
    fc.assert(
      fc.property(validName, (name) => {
        const config: UsersConfig = {
          aws_accounts: [{ name: "dev" }],
          github_teams: [{ name: "team" }],
          iam_groups: [
            { name, account: "dev" },
            { name, account: "dev" },
          ],
          users: [
            {
              name: "user",
              github: { team: "team" },
              iam_assignments: [{ account: "dev", iam_group: name }],
            },
          ],
        };
        expect(() => validateConfig(config)).toThrow(/[Dd]uplicate IAM group/);
      }),
      { numRuns: 100 },
    );
  });

  it("accepts same group name in different accounts (property)", () => {
    fc.assert(
      fc.property(validName, validName, validName, (grpName, acct1, acct2) => {
        fc.pre(acct1 !== acct2);
        const config: UsersConfig = {
          aws_accounts: [{ name: acct1 }, { name: acct2 }],
          github_teams: [{ name: "team" }],
          iam_groups: [
            { name: grpName, account: acct1 },
            { name: grpName, account: acct2 },
          ],
          users: [
            {
              name: "user",
              github: { team: "team" },
              iam_assignments: [{ account: acct1, iam_group: grpName }],
            },
          ],
        };
        expect(() => validateConfig(config)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("rejects duplicate user names (property)", () => {
    fc.assert(
      fc.property(validName, (name) => {
        const config: UsersConfig = {
          aws_accounts: [{ name: "dev" }],
          github_teams: [{ name: "team" }],
          iam_groups: [{ name: "group", account: "dev" }],
          users: [
            {
              name,
              github: { team: "team" },
              iam_assignments: [{ account: "dev", iam_group: "group" }],
            },
            {
              name,
              github: { team: "team" },
              iam_assignments: [{ account: "dev", iam_group: "group" }],
            },
          ],
        };
        expect(() => validateConfig(config)).toThrow(/[Dd]uplicate user name/);
      }),
      { numRuns: 100 },
    );
  });
});
