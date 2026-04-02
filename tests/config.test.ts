import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadConfig, UsersConfig, UserEntry } from "../src/config";

// Feature: devops-user-management, Property 1: Config loading round-trip
// **Validates: Requirements 1.1**

/** Arbitrary for a valid name matching /^[a-z0-9]+(-[a-z0-9]+)*$/ */
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

const validUserEntry: fc.Arbitrary<UserEntry> = fc.record({
  name: validName,
  github_team: validName,
  aws_account: validName,
});

/** Generate a UsersConfig with unique user names */
const validUsersConfig: fc.Arbitrary<UsersConfig> = fc
  .array(validUserEntry, { minLength: 1, maxLength: 10 })
  .map((users) => {
    // Deduplicate by name
    const seen = new Set<string>();
    const unique = users.filter((u) => {
      if (seen.has(u.name)) return false;
      seen.add(u.name);
      return true;
    });
    return { users: unique.length > 0 ? unique : [users[0]] };
  });

describe("Property 1: Config loading round-trip", () => {
  it("serializing to YAML and loading back produces equivalent config", () => {
    fc.assert(
      fc.property(validUsersConfig, (config) => {
        // Serialize to YAML
        const yamlStr = yaml.dump(config);

        // Write to a temp file
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `test-config-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
        fs.writeFileSync(tmpFile, yamlStr, "utf-8");

        try {
          // Load back
          const loaded = loadConfig(tmpFile);

          // Assert equivalence
          expect(loaded.users.length).toBe(config.users.length);
          for (let i = 0; i < config.users.length; i++) {
            expect(loaded.users[i].name).toBe(config.users[i].name);
            expect(loaded.users[i].github_team).toBe(config.users[i].github_team);
            expect(loaded.users[i].aws_account).toBe(config.users[i].aws_account);
          }
        } finally {
          // Cleanup
          fs.unlinkSync(tmpFile);
        }
      }),
      { numRuns: 100 },
    );
  });
});
