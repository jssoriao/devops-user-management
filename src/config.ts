import { load as yamlLoad } from "js-yaml";
import { readFileSync } from "fs";

import { NAME_PATTERN } from "./naming";

export interface UserEntry {
  name: string;
  github_team: string;
  aws_account: string;
}

export interface UsersConfig {
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

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as any).users)
  ) {
    throw new Error(
      `Invalid configuration: expected an object with a "users" array`,
    );
  }

  return parsed as UsersConfig;
}

/**
 * Validate a UsersConfig object. Checks that each user has required fields,
 * names match the naming pattern, and there are no duplicate names.
 * Throws descriptive errors on validation failure.
 */
export function validateConfig(config: UsersConfig) {
  if (!config || !Array.isArray(config.users)) {
    throw new Error(
      'Invalid configuration: expected an object with a "users" array',
    );
  }

  const seenNames = new Set<string>();

  for (let i = 0; i < config.users.length; i++) {
    const user = config.users[i];

    if (!user.name || typeof user.name !== "string") {
      throw new Error(`User at index ${i} is missing required field "name"`);
    }
    if (!user.github_team || typeof user.github_team !== "string") {
      throw new Error(
        `User at index ${i} is missing required field "github_team"`,
      );
    }
    if (!user.aws_account || typeof user.aws_account !== "string") {
      throw new Error(
        `User at index ${i} is missing required field "aws_account"`,
      );
    }

    if (!NAME_PATTERN.test(user.name)) {
      throw new Error(
        `User at index ${i} has invalid name "${user.name}". ` +
          `Names must match pattern: ${NAME_PATTERN}`,
      );
    }

    if (seenNames.has(user.name)) {
      throw new Error(`Duplicate user name "${user.name}" found at index ${i}`);
    }
    seenNames.add(user.name);
  }
}
