import { load as yamlLoad } from "js-yaml";
import { readFileSync } from "fs";

import { NAME_PATTERN } from "./naming";

export interface AWSAccountEntry {
  name: string;
}

export interface GitHubTeamEntry {
  name: string;
  description?: string;
  privacy?: "closed" | "secret";
  parent_team_id?: number;
  parent_team_read_id?: number;
  parent_team_read_slug?: string;
  notification_setting?: string;
  ldap_dn?: string;
  create_default_maintainer?: boolean;
}

export interface IAMGroupEntry {
  name: string;
  account: string;
  policy_arn?: string;
  policy_arns?: string[];
  path?: string;
  permission_boundary?: string;
}

export interface IAMAssignment {
  account: string;
  iam_group: string;
}

export interface GitHubUserConfig {
  team: string;
  role?: "member" | "admin";
  team_role?: "member" | "maintainer";
}

export interface UserEntry {
  name: string;
  github: GitHubUserConfig;
  iam_assignments: IAMAssignment[];
}

export interface UsersConfig {
  aws_accounts: AWSAccountEntry[];
  github_teams: GitHubTeamEntry[];
  iam_groups: IAMGroupEntry[];
  users: UserEntry[];
}

/**
 * Load and parse a YAML configuration file into a UsersConfig object.
 * Throws descriptive errors for missing files or invalid YAML.
 */
export function loadConfig(filePath: string): UsersConfig {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Configuration file not found: ${filePath}`);
    }
    throw new Error(
      `Failed to read configuration file: ${filePath} - ${err.message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = yamlLoad(content);
  } catch (err: any) {
    throw new Error(
      `Invalid YAML in configuration file: ${filePath} - ${err.message}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(
      `Invalid configuration: expected an object with "aws_accounts", "github_teams", "iam_groups", and "users" sections`,
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.aws_accounts)) {
    throw new Error(
      `Invalid configuration: missing or invalid "aws_accounts" section (expected an array)`,
    );
  }
  if (!Array.isArray(obj.github_teams)) {
    throw new Error(
      `Invalid configuration: missing or invalid "github_teams" section (expected an array)`,
    );
  }
  if (!Array.isArray(obj.iam_groups)) {
    throw new Error(
      `Invalid configuration: missing or invalid "iam_groups" section (expected an array)`,
    );
  }
  if (!Array.isArray(obj.users)) {
    throw new Error(
      `Invalid configuration: missing or invalid "users" section (expected an array)`,
    );
  }

  return parsed as UsersConfig;
}

/**
 * Validate a UsersConfig object. Checks all four sections for required fields,
 * naming patterns, duplicates, and cross-references between sections.
 * Throws descriptive errors on validation failure.
 */
export function validateConfig(config: UsersConfig): void {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid configuration: expected an object");
  }

  // --- aws_accounts ---
  if (!Array.isArray(config.aws_accounts)) {
    throw new Error(
      'Invalid configuration: missing or invalid "aws_accounts" section',
    );
  }
  const accountNames = new Set<string>();
  for (let i = 0; i < config.aws_accounts.length; i++) {
    const acct = config.aws_accounts[i];
    if (!acct.name || typeof acct.name !== "string") {
      throw new Error(
        `AWS account at index ${i} is missing required field "name"`,
      );
    }
    if (!NAME_PATTERN.test(acct.name)) {
      throw new Error(
        `AWS account at index ${i} has invalid name "${acct.name}". Names must match pattern: ${NAME_PATTERN}`,
      );
    }
    if (accountNames.has(acct.name)) {
      throw new Error(
        `Duplicate AWS account name "${acct.name}" found at index ${i}`,
      );
    }
    accountNames.add(acct.name);
  }

  // --- github_teams ---
  if (!Array.isArray(config.github_teams)) {
    throw new Error(
      'Invalid configuration: missing or invalid "github_teams" section',
    );
  }
  const teamNames = new Set<string>();
  for (let i = 0; i < config.github_teams.length; i++) {
    const team = config.github_teams[i];
    if (!team.name || typeof team.name !== "string") {
      throw new Error(
        `GitHub team at index ${i} is missing required field "name"`,
      );
    }
    if (!NAME_PATTERN.test(team.name)) {
      throw new Error(
        `GitHub team at index ${i} has invalid name "${team.name}". Names must match pattern: ${NAME_PATTERN}`,
      );
    }
    if (
      team.privacy !== undefined &&
      team.privacy !== "closed" &&
      team.privacy !== "secret"
    ) {
      throw new Error(
        `GitHub team "${team.name}" has invalid privacy value "${team.privacy}". Allowed values: "closed", "secret"`,
      );
    }
    if (teamNames.has(team.name)) {
      throw new Error(
        `Duplicate GitHub team name "${team.name}" found at index ${i}`,
      );
    }
    teamNames.add(team.name);
  }

  // --- iam_groups ---
  if (!Array.isArray(config.iam_groups)) {
    throw new Error(
      'Invalid configuration: missing or invalid "iam_groups" section',
    );
  }
  const groupKeys = new Set<string>();
  for (let i = 0; i < config.iam_groups.length; i++) {
    const group = config.iam_groups[i];
    if (!group.name || typeof group.name !== "string") {
      throw new Error(
        `IAM group at index ${i} is missing required field "name"`,
      );
    }
    if (!group.account || typeof group.account !== "string") {
      throw new Error(
        `IAM group at index ${i} is missing required field "account"`,
      );
    }
    if (!NAME_PATTERN.test(group.name)) {
      throw new Error(
        `IAM group at index ${i} has invalid name "${group.name}". Names must match pattern: ${NAME_PATTERN}`,
      );
    }
    if (!NAME_PATTERN.test(group.account)) {
      throw new Error(
        `IAM group at index ${i} has invalid account "${group.account}". Names must match pattern: ${NAME_PATTERN}`,
      );
    }
    if (!accountNames.has(group.account)) {
      throw new Error(
        `IAM group "${group.name}" references non-existent account "${group.account}"`,
      );
    }
    const key = `${group.account}/${group.name}`;
    if (groupKeys.has(key)) {
      throw new Error(
        `Duplicate IAM group name "${group.name}" for account "${group.account}" found at index ${i}`,
      );
    }
    groupKeys.add(key);
  }

  // --- users ---
  if (!Array.isArray(config.users)) {
    throw new Error(
      'Invalid configuration: missing or invalid "users" section',
    );
  }
  const userNames = new Set<string>();
  for (let i = 0; i < config.users.length; i++) {
    const user = config.users[i];
    if (!user.name || typeof user.name !== "string") {
      throw new Error(`User at index ${i} is missing required field "name"`);
    }
    if (!user.github || typeof user.github !== "object") {
      throw new Error(
        `User at index ${i} is missing required field "github" (expected an object with "team")`,
      );
    }
    if (!user.github.team || typeof user.github.team !== "string") {
      throw new Error(
        `User at index ${i} is missing required field "github.team"`,
      );
    }
    if (
      !Array.isArray(user.iam_assignments) ||
      user.iam_assignments.length === 0
    ) {
      throw new Error(
        `User at index ${i} is missing required field "iam_assignments" (expected a non-empty array)`,
      );
    }
    if (!NAME_PATTERN.test(user.name)) {
      throw new Error(
        `User at index ${i} has invalid name "${user.name}". Names must match pattern: ${NAME_PATTERN}`,
      );
    }
    if (
      user.github.role !== undefined &&
      user.github.role !== "member" &&
      user.github.role !== "admin"
    ) {
      throw new Error(
        `User "${user.name}" has invalid github.role "${user.github.role}". Allowed values: "member", "admin"`,
      );
    }
    if (
      user.github.team_role !== undefined &&
      user.github.team_role !== "member" &&
      user.github.team_role !== "maintainer"
    ) {
      throw new Error(
        `User "${user.name}" has invalid github.team_role "${user.github.team_role}". Allowed values: "member", "maintainer"`,
      );
    }
    if (!teamNames.has(user.github.team)) {
      throw new Error(
        `User "${user.name}" references non-existent GitHub team "${user.github.team}"`,
      );
    }
    if (userNames.has(user.name)) {
      throw new Error(`Duplicate user name "${user.name}" found at index ${i}`);
    }
    userNames.add(user.name);

    for (let j = 0; j < user.iam_assignments.length; j++) {
      const assignment = user.iam_assignments[j];
      if (!assignment.account || typeof assignment.account !== "string") {
        throw new Error(
          `User "${user.name}" iam_assignments[${j}] is missing required field "account"`,
        );
      }
      if (!assignment.iam_group || typeof assignment.iam_group !== "string") {
        throw new Error(
          `User "${user.name}" iam_assignments[${j}] is missing required field "iam_group"`,
        );
      }
      if (!accountNames.has(assignment.account)) {
        throw new Error(
          `User "${user.name}" iam_assignments[${j}] references non-existent account "${assignment.account}"`,
        );
      }
      const groupKey = `${assignment.account}/${assignment.iam_group}`;
      if (!groupKeys.has(groupKey)) {
        throw new Error(
          `User "${user.name}" iam_assignments[${j}] references non-existent IAM group "${assignment.iam_group}" in account "${assignment.account}"`,
        );
      }
    }
  }
}
