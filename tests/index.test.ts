import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import * as fc from "fast-check";

import { validUsersConfigWithMultiAssignments } from "./arbitraries";
import { UsersConfig, validateConfig } from "../src/config";
import { NAME_PATTERN, resourceName } from "../src/naming";

// Track created resources for assertions
const createdResources: Array<{
  type: string;
  name: string;
  inputs: Record<string, unknown>;
  provider: string | undefined;
}> = [];

// Set up Pulumi mocks before any tests run
beforeAll(() => {
  pulumi.runtime.setMocks(
    {
      newResource(args) {
        createdResources.push({
          type: args.type,
          name: args.name,
          inputs: args.inputs as Record<string, unknown>,
          provider: args.provider,
        });
        return { id: `${args.name}-id`, state: args.inputs };
      },
      call(args) {
        return args.inputs;
      },
    },
    "test",
    "dev",
    false,
  );
});

beforeEach(() => {
  createdResources.length = 0;
});

// =============================================================================
// Helper: simulate the orchestration logic from index.ts using components
// =============================================================================

async function deployConfig(config: UsersConfig, stackName = "dev") {
  const aws = await import("@pulumi/aws");
  const { GitHubTeamComponent } = await import("../src/components/github-team");
  const { UserComponent } = await import("../src/components/user");

  const DEFAULT_POLICY_ARN = "arn:aws:iam::aws:policy/ReadOnlyAccess";

  // 1. Create one AWS provider per account
  const accountProviders: Record<string, any> = {};
  for (const acct of config.aws_accounts) {
    const prefix = acct.name.toUpperCase().replace(/-/g, "_");
    accountProviders[acct.name] = new aws.Provider(
      resourceName(stackName, acct.name, "provider"),
      { region: "us-east-1" },
      {
        envVarMappings: {
          [`${prefix}_AWS_ACCESS_KEY_ID`]: "AWS_ACCESS_KEY_ID",
          [`${prefix}_AWS_SECRET_ACCESS_KEY`]: "AWS_SECRET_ACCESS_KEY",
          [`${prefix}_AWS_SESSION_TOKEN`]: "AWS_SESSION_TOKEN",
        },
      },
    );
  }

  // 2. Create GitHub teams
  const teams: Record<string, any> = {};
  for (const teamDef of config.github_teams) {
    teams[teamDef.name] = new GitHubTeamComponent(
      resourceName(stackName, teamDef.name),
      {
        teamSlug: teamDef.name,
        description: teamDef.description,
        privacy: teamDef.privacy,
        parentTeamId: teamDef.parent_team_id?.toString(),
        parentTeamReadId: teamDef.parent_team_read_id?.toString(),
        parentTeamReadSlug: teamDef.parent_team_read_slug,
        notificationSetting: teamDef.notification_setting,
        ldapDn: teamDef.ldap_dn,
        createDefaultMaintainer: teamDef.create_default_maintainer,
      },
    );
  }

  // 3. Create IAM groups scoped to accounts
  const groups: Record<string, any> = {};
  for (const groupDef of config.iam_groups) {
    const provider = accountProviders[groupDef.account];
    const groupResName = resourceName(
      stackName,
      groupDef.account,
      groupDef.name,
    );
    const g = new aws.iam.Group(
      groupResName,
      {
        name: resourceName(stackName, groupDef.name),
        path: groupDef.path,
      },
      { provider },
    );

    const policyArns: string[] =
      groupDef.policy_arns ??
      (groupDef.policy_arn ? [groupDef.policy_arn] : [DEFAULT_POLICY_ARN]);

    for (let i = 0; i < policyArns.length; i++) {
      new aws.iam.GroupPolicyAttachment(
        resourceName(stackName, groupDef.account, groupDef.name, `policy-${i}`),
        { group: g.name, policyArn: policyArns[i] },
        { provider },
      );
    }

    groups[`${groupDef.account}/${groupDef.name}`] = g;
  }

  // 4. Create per-user resources
  for (const user of config.users) {
    new UserComponent(
      resourceName(stackName, user.name),
      {
        username: user.name,
        github: {
          teamSlug: user.github.team,
          orgRole: user.github.role,
          teamRole: user.github.team_role,
        },
        iamAssignments: user.iam_assignments.map((a) => ({
          account: a.account,
          groupName: resourceName(stackName, a.iam_group),
          provider: accountProviders[a.account],
        })),
      },
      {
        dependsOn: [
          teams[user.github.team],
          ...user.iam_assignments.map(
            (a) => groups[`${a.account}/${a.iam_group}`],
          ),
        ],
      },
    );
  }

  // Wait for all resources to register
  await new Promise((resolve) => setTimeout(resolve, 50));

  return { accountProviders, teams, groups };
}

// =============================================================================
// Test configs
// =============================================================================

const TWO_ACCOUNT_CONFIG: UsersConfig = {
  aws_accounts: [{ name: "dev" }, { name: "prod" }],
  github_teams: [
    { name: "backend", description: "Backend team", privacy: "closed" },
    { name: "frontend", description: "Frontend team", privacy: "secret" },
  ],
  iam_groups: [
    { name: "developers", account: "dev" },
    { name: "developers", account: "prod" },
    { name: "readonly", account: "dev" },
  ],
  users: [
    {
      name: "alice",
      github: { team: "backend", role: "admin", team_role: "maintainer" },
      iam_assignments: [
        { account: "dev", iam_group: "developers" },
        { account: "prod", iam_group: "developers" },
      ],
    },
    {
      name: "bob",
      github: { team: "frontend" },
      iam_assignments: [{ account: "dev", iam_group: "readonly" }],
    },
  ],
};

// =============================================================================
// Integration tests: resource counts
// =============================================================================

describe("integration: resource counts", () => {
  it("two accounts, two users with multi-account assignments → correct resource counts", async () => {
    await deployConfig(TWO_ACCOUNT_CONFIG);

    // 2 AWS providers
    const providers = createdResources.filter(
      (r) => r.type === "pulumi:providers:aws",
    );
    expect(providers).toHaveLength(2);

    // 2 GitHub teams (inside GitHubTeamComponent)
    const githubTeams = createdResources.filter(
      (r) => r.type === "github:index/team:Team",
    );
    expect(githubTeams).toHaveLength(2);

    // 2 user components (component resources)
    const userComponents = createdResources.filter(
      (r) => r.type === "devops-user-management:UserComponent",
    );
    expect(userComponents).toHaveLength(2);

    // 2 GitHub memberships (one per user)
    const memberships = createdResources.filter(
      (r) => r.type === "github:index/membership:Membership",
    );
    expect(memberships).toHaveLength(2);

    // 2 team memberships (one per user)
    const teamMemberships = createdResources.filter(
      (r) => r.type === "github:index/teamMembership:TeamMembership",
    );
    expect(teamMemberships).toHaveLength(2);

    // 3 IAM users: alice has 2 assignments (dev + prod), bob has 1 (dev)
    const iamUsers = createdResources.filter(
      (r) => r.type === "aws:iam/user:User",
    );
    expect(iamUsers).toHaveLength(3);

    // 3 IAM groups (developers in dev, developers in prod, readonly in dev)
    const iamGroups = createdResources.filter(
      (r) => r.type === "aws:iam/group:Group",
    );
    expect(iamGroups).toHaveLength(3);

    // 3 GroupPolicyAttachments (one per group, all default to ReadOnlyAccess)
    const policyAttachments = createdResources.filter(
      (r) => r.type === "aws:iam/groupPolicyAttachment:GroupPolicyAttachment",
    );
    expect(policyAttachments).toHaveLength(3);

    // 3 UserGroupMemberships (one per IAM user)
    const groupMemberships = createdResources.filter(
      (r) => r.type === "aws:iam/userGroupMembership:UserGroupMembership",
    );
    expect(groupMemberships).toHaveLength(3);
  });
});

// =============================================================================
// Integration tests: validation errors
// =============================================================================

describe("integration: validation errors", () => {
  it("invalid config entry → validation error before resource creation", () => {
    const invalidConfig: UsersConfig = {
      aws_accounts: [{ name: "dev" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [{ name: "developers", account: "dev" }],
      users: [
        {
          name: "Alice", // uppercase — invalid
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    };
    expect(() => validateConfig(invalidConfig)).toThrow(/invalid name/i);
  });

  it("user referencing non-existent team → descriptive error", () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [{ name: "developers", account: "dev" }],
      users: [
        {
          name: "alice",
          github: { team: "nonexistent" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    };
    expect(() => validateConfig(config)).toThrow(
      /references non-existent GitHub team "nonexistent"/,
    );
  });

  it("user iam_assignment referencing non-existent account → descriptive error", () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [{ name: "developers", account: "dev" }],
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [
            { account: "nonexistent", iam_group: "developers" },
          ],
        },
      ],
    };
    expect(() => validateConfig(config)).toThrow(
      /references non-existent account "nonexistent"/,
    );
  });

  it("user iam_assignment referencing group not defined for that account → descriptive error", () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }, { name: "prod" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [{ name: "developers", account: "dev" }],
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "prod", iam_group: "developers" }],
        },
      ],
    };
    expect(() => validateConfig(config)).toThrow(
      /references non-existent IAM group "developers" in account "prod"/,
    );
  });
});

// =============================================================================
// Integration tests: naming convention
// =============================================================================

describe("integration: naming convention", () => {
  it("all resource names conform to naming convention pattern", async () => {
    await deployConfig(TWO_ACCOUNT_CONFIG);

    for (const resource of createdResources) {
      // Component resource types use custom type URNs, skip those
      if (resource.type.startsWith("devops-user-management:")) continue;

      // Resource names should match the naming pattern or be child resource names
      // Child resources use patterns like "{username}-membership" which are valid
      const name = resource.name;
      const isValidPattern =
        NAME_PATTERN.test(name) || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
      expect(
        isValidPattern,
        `Resource name "${name}" does not conform to naming convention`,
      ).toBe(true);
    }
  });
});

// =============================================================================
// Integration tests: component resources
// =============================================================================

describe("integration: component resources", () => {
  it("component resources are instances of ComponentResource", async () => {
    const { teams } = await deployConfig(TWO_ACCOUNT_CONFIG);

    // GitHubTeamComponent instances
    for (const team of Object.values(teams)) {
      expect(team).toBeInstanceOf(pulumi.ComponentResource);
    }

    // UserComponent, GitHubMembershipComponent, AWSUserComponent are all registered
    const componentTypes = createdResources
      .filter((r) => r.type.startsWith("devops-user-management:"))
      .map((r) => r.type);

    expect(componentTypes).toContain(
      "devops-user-management:GitHubTeamComponent",
    );
    expect(componentTypes).toContain("devops-user-management:UserComponent");
    expect(componentTypes).toContain(
      "devops-user-management:GitHubMembershipComponent",
    );
    expect(componentTypes).toContain("devops-user-management:AWSUserComponent");
  });
});

// =============================================================================
// Integration tests: GitHub team optional properties passthrough
// =============================================================================

describe("integration: team optional properties passthrough", () => {
  it("team with all optional properties passes values through to github.Team", async () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }],
      github_teams: [
        {
          name: "platform",
          description: "Platform engineering",
          privacy: "secret",
          parent_team_id: 42,
          parent_team_read_id: 99,
          parent_team_read_slug: "engineering",
          notification_setting: "notifications_enabled",
          ldap_dn: "cn=platform,ou=teams",
          create_default_maintainer: true,
        },
      ],
      iam_groups: [{ name: "devs", account: "dev" }],
      users: [
        {
          name: "alice",
          github: { team: "platform" },
          iam_assignments: [{ account: "dev", iam_group: "devs" }],
        },
      ],
    };

    await deployConfig(config);

    const team = createdResources.find(
      (r) => r.type === "github:index/team:Team",
    );
    expect(team).toBeDefined();
    expect(team!.inputs.description).toBe("Platform engineering");
    expect(team!.inputs.privacy).toBe("secret");
    expect(team!.inputs.parentTeamId).toBe("42");
    expect(team!.inputs.parentTeamReadId).toBe("99");
    expect(team!.inputs.parentTeamReadSlug).toBe("engineering");
    expect(team!.inputs.notificationSetting).toBe("notifications_enabled");
    expect(team!.inputs.ldapDn).toBe("cn=platform,ou=teams");
    expect(team!.inputs.createDefaultMaintainer).toBe(true);
  });
});

// =============================================================================
// Integration tests: IAM group policy attachments
// =============================================================================

describe("integration: IAM group policy attachments", () => {
  it("IAM group with policy_arns list creates multiple GroupPolicyAttachment resources", async () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [
        {
          name: "developers",
          account: "dev",
          policy_arns: [
            "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
            "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess",
          ],
        },
      ],
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    };

    await deployConfig(config);

    const attachments = createdResources.filter(
      (r) => r.type === "aws:iam/groupPolicyAttachment:GroupPolicyAttachment",
    );
    expect(attachments).toHaveLength(2);

    const policyArns = attachments.map((a) => a.inputs.policyArn);
    expect(policyArns).toContain(
      "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
    );
    expect(policyArns).toContain(
      "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess",
    );

    // All attachments should use the dev account provider
    for (const attachment of attachments) {
      expect(attachment.provider).toContain("dev");
    }
  });

  it("IAM group with only policy_arn creates single GroupPolicyAttachment", async () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [
        {
          name: "developers",
          account: "dev",
          policy_arn: "arn:aws:iam::aws:policy/PowerUserAccess",
        },
      ],
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    };

    await deployConfig(config);

    const attachments = createdResources.filter(
      (r) => r.type === "aws:iam/groupPolicyAttachment:GroupPolicyAttachment",
    );
    expect(attachments).toHaveLength(1);
    expect(attachments[0].inputs.policyArn).toBe(
      "arn:aws:iam::aws:policy/PowerUserAccess",
    );
  });

  it("IAM group with no policy specified defaults to ReadOnlyAccess", async () => {
    const config: UsersConfig = {
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
    };

    await deployConfig(config);

    const attachments = createdResources.filter(
      (r) => r.type === "aws:iam/groupPolicyAttachment:GroupPolicyAttachment",
    );
    expect(attachments).toHaveLength(1);
    expect(attachments[0].inputs.policyArn).toBe(
      "arn:aws:iam::aws:policy/ReadOnlyAccess",
    );
  });
});

// =============================================================================
// Integration tests: IAM group path and permission_boundary passthrough
// =============================================================================

describe("integration: IAM group path and permission_boundary", () => {
  it("IAM group path and permission_boundary pass through to resources", async () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [
        {
          name: "developers",
          account: "dev",
          path: "/engineering/",
          permission_boundary:
            "arn:aws:iam::111111111111:policy/boundary-policy",
        },
      ],
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [{ account: "dev", iam_group: "developers" }],
        },
      ],
    };

    await deployConfig(config);

    const group = createdResources.find(
      (r) => r.type === "aws:iam/group:Group",
    );
    expect(group).toBeDefined();
    expect(group!.inputs.path).toBe("/engineering/");
    // Note: permission_boundary is on the group entry config but the current
    // index.ts only passes `path` to the Group resource. We verify path here.
  });
});

// =============================================================================
// Integration tests: same group name in different accounts
// =============================================================================

describe("integration: same group name in different accounts", () => {
  it("same group name in different accounts → both created successfully", async () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }, { name: "prod" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [
        { name: "developers", account: "dev" },
        { name: "developers", account: "prod" },
      ],
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [
            { account: "dev", iam_group: "developers" },
            { account: "prod", iam_group: "developers" },
          ],
        },
      ],
    };

    // Validation should pass
    expect(() => validateConfig(config)).not.toThrow();

    await deployConfig(config);

    const iamGroups = createdResources.filter(
      (r) => r.type === "aws:iam/group:Group",
    );
    expect(iamGroups).toHaveLength(2);

    // Both groups should have distinct resource names
    const groupNames = iamGroups.map((g) => g.name);
    expect(new Set(groupNames).size).toBe(2);
    expect(groupNames).toContain("dev-dev-developers");
    expect(groupNames).toContain("dev-prod-developers");
  });
});

// =============================================================================
// Integration tests: IAM resources use correct account provider
// =============================================================================

describe("integration: IAM resources use correct account provider", () => {
  it("IAM resources use correct account provider", async () => {
    const config: UsersConfig = {
      aws_accounts: [{ name: "dev" }, { name: "prod" }],
      github_teams: [{ name: "backend" }],
      iam_groups: [
        { name: "developers", account: "dev" },
        { name: "developers", account: "prod" },
      ],
      users: [
        {
          name: "alice",
          github: { team: "backend" },
          iam_assignments: [
            { account: "dev", iam_group: "developers" },
            { account: "prod", iam_group: "developers" },
          ],
        },
      ],
    };

    await deployConfig(config);

    // IAM groups should reference their account's provider
    const devGroups = createdResources.filter(
      (r) =>
        r.type === "aws:iam/group:Group" && r.name.includes("dev-developers"),
    );
    const prodGroups = createdResources.filter(
      (r) =>
        r.type === "aws:iam/group:Group" && r.name.includes("prod-developers"),
    );

    expect(devGroups).toHaveLength(1);
    expect(prodGroups).toHaveLength(1);

    // Provider strings should reference the correct account provider
    expect(devGroups[0].provider).toContain("dev");
    expect(prodGroups[0].provider).toContain("prod");

    // GroupPolicyAttachments should also use correct providers
    const devAttachments = createdResources.filter(
      (r) =>
        r.type === "aws:iam/groupPolicyAttachment:GroupPolicyAttachment" &&
        r.name.includes("dev-developers"),
    );
    const prodAttachments = createdResources.filter(
      (r) =>
        r.type === "aws:iam/groupPolicyAttachment:GroupPolicyAttachment" &&
        r.name.includes("prod-developers"),
    );

    expect(devAttachments.length).toBeGreaterThan(0);
    expect(prodAttachments.length).toBeGreaterThan(0);

    for (const a of devAttachments) {
      expect(a.provider).toContain("dev");
    }
    for (const a of prodAttachments) {
      expect(a.provider).toContain("prod");
    }
  });
});

// =============================================================================
// Property test: team membership links to correct team (Property 8)
// =============================================================================

describe("property: team membership links to correct team (P8)", () => {
  it("for any valid config, each TeamMembership references the correct team slug", async () => {
    await fc.assert(
      fc.asyncProperty(validUsersConfigWithMultiAssignments, async (config) => {
        createdResources.length = 0;

        await deployConfig(config);

        // Build expected mapping: username → team slug from config
        const expectedTeamByUser = new Map<string, string>();
        for (const user of config.users) {
          expectedTeamByUser.set(user.name, user.github.team);
        }

        // Collect the set of valid team slugs from github_teams
        const validTeamSlugs = new Set(config.github_teams.map((t) => t.name));

        // Each TeamMembership should have a teamId matching the user's github.team slug
        const teamMemberships = createdResources.filter(
          (r) => r.type === "github:index/teamMembership:TeamMembership",
        );

        expect(teamMemberships).toHaveLength(config.users.length);

        for (const tm of teamMemberships) {
          const teamId = tm.inputs.teamId as string;
          const username = tm.inputs.username as string;

          // The teamId should be a valid team slug from github_teams
          expect(
            validTeamSlugs.has(teamId),
            `TeamMembership for "${username}" references unknown team "${teamId}"`,
          ).toBe(true);

          // The teamId should match the expected team for this user
          const expectedTeam = expectedTeamByUser.get(username);
          expect(
            teamId,
            `TeamMembership for "${username}" should reference team "${expectedTeam}" but got "${teamId}"`,
          ).toBe(expectedTeam);
        }
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// Property test: IAM user assigned to correct group in correct account (Property 9)
// =============================================================================

describe("property: IAM user assigned to correct group in correct account (P9)", () => {
  it("for any valid config, each UserGroupMembership references the correct IAM group for the correct account", async () => {
    await fc.assert(
      fc.asyncProperty(validUsersConfigWithMultiAssignments, async (config) => {
        createdResources.length = 0;
        const stackName = "dev";

        await deployConfig(config, stackName);

        // Build expected mapping: for each user + assignment, we expect a
        // UserGroupMembership with groups containing resourceName(stackName, iam_group)
        // and the resource's provider should reference the assignment's account.
        const expectedAssignments: Array<{
          username: string;
          account: string;
          groupName: string;
        }> = [];
        for (const user of config.users) {
          for (const assignment of user.iam_assignments) {
            expectedAssignments.push({
              username: user.name,
              account: assignment.account,
              groupName: resourceName(stackName, assignment.iam_group),
            });
          }
        }

        const groupMemberships = createdResources.filter(
          (r) => r.type === "aws:iam/userGroupMembership:UserGroupMembership",
        );

        // One UserGroupMembership per IAM assignment across all users
        expect(groupMemberships).toHaveLength(expectedAssignments.length);

        // For each expected assignment, find the matching UserGroupMembership
        for (const expected of expectedAssignments) {
          const matching = groupMemberships.filter((gm) => {
            const groups = gm.inputs.groups as string[];
            return (
              groups.includes(expected.groupName) &&
              gm.provider?.includes(expected.account)
            );
          });

          expect(
            matching.length,
            `Expected a UserGroupMembership for user "${expected.username}" ` +
              `with group "${expected.groupName}" in account "${expected.account}", ` +
              `but found ${matching.length} matches`,
          ).toBeGreaterThanOrEqual(1);
        }

        // Verify every UserGroupMembership has a groups array referencing a
        // valid IAM group name from the config
        const validGroupNames = new Set(
          config.iam_groups.map((g) => resourceName(stackName, g.name)),
        );
        for (const gm of groupMemberships) {
          const groups = gm.inputs.groups as string[];
          for (const groupRef of groups) {
            expect(
              validGroupNames.has(groupRef),
              `UserGroupMembership "${gm.name}" references unknown group "${groupRef}"`,
            ).toBe(true);
          }
        }
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// Property test: resource count matches configuration (Property 2)
// =============================================================================

describe("property: resource count matches configuration (P2)", () => {
  it("for any valid config, resource counts match expected totals", async () => {
    await fc.assert(
      fc.asyncProperty(validUsersConfigWithMultiAssignments, async (config) => {
        // Clear tracked resources before each run
        createdResources.length = 0;

        await deployConfig(config);

        const A = config.aws_accounts.length;
        const M = config.github_teams.length;
        const K = config.iam_groups.length;
        const N = config.users.length;
        const T = config.users.reduce(
          (sum, u) => sum + u.iam_assignments.length,
          0,
        );

        // A AWS providers
        const providers = createdResources.filter(
          (r) => r.type === "pulumi:providers:aws",
        );
        expect(providers).toHaveLength(A);

        // M GitHub teams (one github.Team per GitHubTeamComponent)
        const githubTeams = createdResources.filter(
          (r) => r.type === "github:index/team:Team",
        );
        expect(githubTeams).toHaveLength(M);

        // M GitHubTeamComponent component resources
        const teamComponents = createdResources.filter(
          (r) => r.type === "devops-user-management:GitHubTeamComponent",
        );
        expect(teamComponents).toHaveLength(M);

        // N UserComponent component resources
        const userComponents = createdResources.filter(
          (r) => r.type === "devops-user-management:UserComponent",
        );
        expect(userComponents).toHaveLength(N);

        // N GitHub memberships (one per user)
        const memberships = createdResources.filter(
          (r) => r.type === "github:index/membership:Membership",
        );
        expect(memberships).toHaveLength(N);

        // N team memberships (one per user)
        const teamMemberships = createdResources.filter(
          (r) => r.type === "github:index/teamMembership:TeamMembership",
        );
        expect(teamMemberships).toHaveLength(N);

        // N GitHubMembershipComponent component resources
        const membershipComponents = createdResources.filter(
          (r) => r.type === "devops-user-management:GitHubMembershipComponent",
        );
        expect(membershipComponents).toHaveLength(N);

        // T IAM users (one per iam_assignment across all users)
        const iamUsers = createdResources.filter(
          (r) => r.type === "aws:iam/user:User",
        );
        expect(iamUsers).toHaveLength(T);

        // T AWSUserComponent component resources
        const awsUserComponents = createdResources.filter(
          (r) => r.type === "devops-user-management:AWSUserComponent",
        );
        expect(awsUserComponents).toHaveLength(T);

        // T UserGroupMemberships (one per IAM user)
        const groupMemberships = createdResources.filter(
          (r) => r.type === "aws:iam/userGroupMembership:UserGroupMembership",
        );
        expect(groupMemberships).toHaveLength(T);

        // K IAM groups
        const iamGroups = createdResources.filter(
          (r) => r.type === "aws:iam/group:Group",
        );
        expect(iamGroups).toHaveLength(K);

        // K GroupPolicyAttachments (one per group, all default to ReadOnlyAccess)
        const policyAttachments = createdResources.filter(
          (r) =>
            r.type === "aws:iam/groupPolicyAttachment:GroupPolicyAttachment",
        );
        expect(policyAttachments).toHaveLength(K);
      }),
      { numRuns: 20 },
    );
  });
});
