import * as fc from "fast-check";

import type {
  AWSAccountEntry,
  GitHubTeamEntry,
  IAMAssignment,
  IAMGroupEntry,
  UserEntry,
  UsersConfig,
} from "../src/config";

/** Arbitrary for a valid name segment (lowercase alphanumeric, non-empty) */
export const validNameSegment = fc.string({
  unit: fc.mapToConstant(
    { num: 26, build: (v) => String.fromCharCode(97 + v) }, // a-z
    { num: 10, build: (v) => String.fromCharCode(48 + v) }, // 0-9
  ),
  minLength: 1,
  maxLength: 8,
});

/** Arbitrary for a valid name matching /^[a-z0-9]+(-[a-z0-9]+)*$/ */
export const validName = fc
  .array(validNameSegment, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("-"));

/** Arbitrary for a valid AWSAccountEntry */
export const validAWSAccountEntry: fc.Arbitrary<AWSAccountEntry> =
  validName.map((name) => ({ name }));

/** Arbitrary for a valid GitHubTeamEntry with optional properties */
export const validGitHubTeamEntry: fc.Arbitrary<GitHubTeamEntry> = fc.record(
  {
    name: validName,
    description: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
      nil: undefined,
    }),
    privacy: fc.option(fc.constantFrom("closed" as const, "secret" as const), {
      nil: undefined,
    }),
  },
  { requiredKeys: ["name"] },
);

/** Arbitrary for a valid IAMGroupEntry (account must be provided by caller for cross-ref validity) */
export function validIAMGroupEntry(
  accountName: string,
): fc.Arbitrary<IAMGroupEntry> {
  return fc
    .record(
      {
        name: validName,
        policy_arn: fc.option(
          fc.constant("arn:aws:iam::aws:policy/ReadOnlyAccess"),
          { nil: undefined },
        ),
        path: fc.option(fc.constant("/engineering/"), { nil: undefined }),
      },
      { requiredKeys: ["name"] },
    )
    .map((entry) => ({ ...entry, account: accountName }));
}

/** Arbitrary for a valid IAMAssignment referencing a known account and group */
export function validIAMAssignment(
  accountName: string,
  groupName: string,
): fc.Arbitrary<IAMAssignment> {
  return fc.constant({ account: accountName, iam_group: groupName });
}

/**
 * Arbitrary for a valid four-section UsersConfig where all cross-references resolve.
 * Generates 1-3 accounts, 1-3 teams, 1-3 groups per account, and 1-5 users.
 */
export const validUsersConfig: fc.Arbitrary<UsersConfig> = fc
  .record({
    accountNames: fc.uniqueArray(validName, { minLength: 1, maxLength: 3 }),
    teamNames: fc.uniqueArray(validName, { minLength: 1, maxLength: 3 }),
    groupNames: fc.uniqueArray(validName, { minLength: 1, maxLength: 3 }),
    userNames: fc.uniqueArray(validName, { minLength: 1, maxLength: 5 }),
  })
  .filter(
    (r) =>
      r.accountNames.length > 0 &&
      r.teamNames.length > 0 &&
      r.groupNames.length > 0 &&
      r.userNames.length > 0,
  )
  .map(({ accountNames, teamNames, groupNames, userNames }) => {
    const aws_accounts: AWSAccountEntry[] = accountNames.map((name) => ({
      name,
    }));

    const github_teams: GitHubTeamEntry[] = teamNames.map((name) => ({
      name,
    }));

    // Create one group per groupName per account
    const iam_groups: IAMGroupEntry[] = [];
    for (const acctName of accountNames) {
      for (const grpName of groupNames) {
        iam_groups.push({ name: grpName, account: acctName });
      }
    }

    // Each user gets the first team and one assignment to the first account/group
    const users: UserEntry[] = userNames.map((name) => ({
      name,
      github: { team: teamNames[0] },
      iam_assignments: [{ account: accountNames[0], iam_group: groupNames[0] }],
    }));

    return { aws_accounts, github_teams, iam_groups, users };
  });

/** Name containing at least one invalid character */
export const invalidName = fc.oneof(
  fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /[A-Z]/.test(s)),
  validName.map((n) => n + "!"),
  validName.map((n) => n + " x"),
  validName.map((n) => "-" + n),
  validName.map((n) => n + "-"),
  fc.constant(""),
);
