# Implementation Plan: Pulumi User Management

## Overview

Incrementally build a Pulumi TypeScript project that manages GitHub teams/memberships and AWS IAM users/groups across multiple AWS accounts from a four-section YAML config (`aws_accounts`, `github_teams`, `iam_groups`, `users`). Each task builds on the previous, starting with project scaffolding and config loading, then component resources, multi-account orchestration, testing, CI pipeline, and documentation. Tasks already completed (project setup, naming, CI) are preserved; tasks requiring rework for the multi-account model are reset.

## Tasks

- [x] 1. Initialize project structure and dependencies
  - Create `Pulumi.yaml` with project name `devops-user-management` and runtime `nodejs`
  - Create `package.json` with dependencies: `@pulumi/pulumi`, `@pulumi/github`, `@pulumi/aws`, `js-yaml`, and devDependencies: `typescript`, `vitest`, `fast-check`, `@types/js-yaml`
  - Create `tsconfig.json` with strict mode, ES2020 target, and module resolution
  - Create empty `src/` and `tests/` directories with placeholder files
  - _Requirements: 1.1_

- [x] 2. Update configuration loading and validation for four-section multi-account config
  - [x] 2.1 Update `src/config.ts` interfaces and `loadConfig` for four-section config
    - Add `AWSAccountEntry` interface with required `name`
    - Add `GitHubTeamEntry` interface with `name`, `description?`, `privacy?`, `parent_team_id?`, `parent_team_read_id?`, `parent_team_read_slug?`, `notification_setting?`, `ldap_dn?`, `create_default_maintainer?`
    - Add `IAMGroupEntry` interface with `name`, required `account` (references an `aws_accounts` entry), `policy_arn?`, `policy_arns?`, `path?`, `permission_boundary?`
    - Add `IAMAssignment` interface with required `account` and `iam_group`
    - Update `UserEntry` to replace `iam_group: string` with `iam_assignments: IAMAssignment[]`
    - Update `UsersConfig` to have four sections: `aws_accounts: AWSAccountEntry[]`, `github_teams: GitHubTeamEntry[]`, `iam_groups: IAMGroupEntry[]`, `users: UserEntry[]`
    - Update `loadConfig` to validate that all four root-level sections exist and are arrays
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 2.2 Update `validateConfig` for four-section validation and cross-reference checks
    - Validate each `aws_accounts` entry has a `name` matching the naming pattern
    - Validate each `github_teams` entry has a `name` matching the naming pattern
    - Validate each `iam_groups` entry has a `name` and required `account` matching the naming pattern
    - Validate each user has `name`, `github_team`, and non-empty `iam_assignments` array
    - Validate each `iam_assignments` entry has `account` and `iam_group`
    - Validate `privacy` values are `"closed"` or `"secret"` when specified
    - Validate no duplicate `name` values within `aws_accounts`
    - Validate no duplicate `name` values within `github_teams`
    - Validate no duplicate `name`+`account` pairs within `iam_groups` (same name with different accounts is allowed)
    - Validate no duplicate `name` values within `users`
    - Cross-reference: every `iam_groups` entry's `account` must match a `name` in `aws_accounts`
    - Cross-reference: every user's `github_team` must match a `name` in `github_teams`
    - Cross-reference: every user's `iam_assignments[].account` must match a `name` in `aws_accounts`
    - Cross-reference: every user's `iam_assignments[].iam_group` must match an IAM group defined for that specific account in `iam_groups`
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 2.3 Update `users.yaml` to four-section format with multi-account assignments
    - Add `aws_accounts` section with account entries (e.g., `dev-account`, `prod-account`)
    - Add `github_teams` section with team entries (at minimum `name`, optionally `description`, `privacy`)
    - Add `iam_groups` section with group entries including required `account` field (e.g., `backend-developers` in `dev-account` and `prod-account`)
    - Update `users` section: replace `iam_group` with `iam_assignments` list of `{ account, iam_group }` objects
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 1.7, 1.8_

  - [x] 2.4 Update `tests/arbitraries.ts` with generators for multi-account config types
    - Add `validAWSAccountEntry` arbitrary generating `AWSAccountEntry` objects with valid names
    - Add `validGitHubTeamEntry` arbitrary generating `GitHubTeamEntry` objects with valid names and optional properties (`description`, `privacy`, `parent_team_id`, etc.)
    - Add `validIAMGroupEntry` arbitrary generating `IAMGroupEntry` objects with valid names and required `account` referencing a generated account
    - Add `validIAMAssignment` arbitrary generating `IAMAssignment` objects with valid `account` and `iam_group` references
    - Add `validUsersConfig` arbitrary generating four-section configs where all cross-references are valid (user `github_team` → `github_teams`, user `iam_assignments[].account` → `aws_accounts`, user `iam_assignments[].iam_group` → `iam_groups` for that account, group `account` → `aws_accounts`)
    - _Requirements: 1.1, 1.2, 6.1, 6.2, 6.3, 6.4_

  - [x] 2.5 Update `tests/config.test.ts` for four-section multi-account config
    - Update Property 1 (round-trip) test to use four-section config with `aws_accounts`, `github_teams`, `iam_groups`, `users` including `iam_assignments`
    - Update Property 4 (validation rejects invalid) tests to cover missing account `name`, missing group `account`, missing `iam_assignments`, missing `iam_assignments[].account`, missing `iam_assignments[].iam_group`, invalid `privacy` values
    - Add unit tests for missing `aws_accounts` section, missing `github_teams` section, missing `iam_groups` section
    - Keep existing tests for user-level validation (missing fields, invalid names) updated for new structure
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 6.5, 7.3_
    - _Property tests:_
      - [x] P1: Config loading round-trip (updated for four-section config with iam_assignments)
      - [x] P4: Validation rejects missing required fields and invalid names (extended for account, group account, iam_assignments entries)

  - [x] 2.6 Add property and unit tests for cross-reference and duplicate validation
    - Add Property 5 test: configs where user `iam_assignments[].account` references non-existent account, or `iam_assignments[].iam_group` references group not defined for that account, or `github_team` references non-existent team, or `iam_groups` entry `account` references non-existent account → `validateConfig` throws descriptive error
    - Add Property 6 test: configs with duplicate `name` within `aws_accounts`, duplicate `name` within `github_teams`, duplicate `name`+`account` pair within `iam_groups`, or duplicate `name` within `users` → `validateConfig` throws duplicate error. Same group name with different accounts should be accepted.
    - Add unit tests for specific cross-reference failure messages (user assignment references non-existent account, user assignment references group not in that account, user references non-existent team, iam_groups entry references non-existent account)
    - Add unit tests for specific duplicate failure messages (duplicate account name, duplicate team name, duplicate group name+account pair, duplicate user name)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 6.9_
    - _Property tests:_
      - [x] P5: Cross-reference validation rejects unresolved references (accounts on groups, team/account/group on user assignments)
      - [x] P6: No duplicate names within sections (including name+account uniqueness for iam_groups)

- [x] 3. Implement naming convention utility
  - [x] 3.1 Create `src/naming.ts` — already complete, no changes needed
    - _Requirements: 7.1, 7.2_

  - [x] 3.2 Property test for naming convention — already complete, no changes needed
    - **Property 3: Naming convention output format**
    - **Validates: Requirements 7.1, 7.2, 2.2, 3.5, 4.2**

- [x] 4. Checkpoint - Validate config and naming modules
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create CI workflow for tests
  - [x] 5.1 `.github/workflows/ci.yml` — already complete, no changes needed
    - _Requirements: 11.1_

- [x] 6. Update GitHubTeamComponent for full property support
  - [x] 6.1 Update `src/components/github-team.ts` with all `github.Team` properties
    - Extend `GitHubTeamComponentArgs` with: `privacy?`, `parentTeamId?`, `parentTeamReadId?`, `parentTeamReadSlug?`, `notificationSetting?`, `ldapDn?`, `createDefaultMaintainer?`
    - Pass all optional properties through to the `github.Team` resource constructor only when defined
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10_

  - [ ]* 6.2 Write property test for optional properties passthrough (Property 11)
    - **Property 11: GitHub team and IAM group optional properties passthrough**
    - Use Pulumi mocks and fast-check to generate random `GitHubTeamComponentArgs` with optional properties and verify the created `github.Team` resource reflects those values
    - Also test `IAMGroupEntry` optional properties (`path`, `permission_boundary`) passthrough
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 5.5, 5.6**

- [x] 7. Verify GitHubMembershipComponent tests
  - [x] 7.1 Verify `src/components/github-membership.ts` — no code changes needed
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 7.2 Verify property test for default membership role still passes
    - **Property 7: Default membership role**
    - Verify existing `tests/github-membership.test.ts` property test still passes with no changes
    - **Validates: Requirements 3.3**

- [x] 8. Update AWSUserComponent for multi-account provider support
  - [x] 8.1 Update `src/components/aws-user.ts`
    - Remove `policyArn?` from `AWSUserComponentArgs` — policy management is at the IAM group level
    - Keep `username` and `groupName` fields
    - Keep `aws.iam.User` and `aws.iam.UserGroupMembership` creation
    - The caller passes the correct account's `aws.Provider` via `opts.provider` for account targeting — no changes needed in the component itself beyond removing `policyArn`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 8.5 Create `UserComponent` wrapper in `src/components/user.ts`
    - Create `IAMAssignmentArgs` interface with `account: string`, `groupName: string`, `provider: aws.Provider`
    - Create `UserComponentArgs` interface with `username: string`, `github: { teamSlug, orgRole?, teamRole? }`, `iamAssignments: IAMAssignmentArgs[]`
    - Implement `UserComponent` extending `pulumi.ComponentResource` with type `devops-user-management:UserComponent`
    - Create one `GitHubMembershipComponent` as a child (`{ parent: this }`) using `args.github` properties
    - Loop `args.iamAssignments` to create one `AWSUserComponent` per entry with `{ parent: this, provider: assignment.provider }`
    - Expose `githubMembership: GitHubMembershipComponent` and `awsUsers: AWSUserComponent[]` as public readonly fields
    - _Requirements: 4.1, 4.5, 3.1, 3.2_

- [x] 9. Update main entry point for multi-account orchestration
  - [x] 9.1 Update `index.ts` for multi-account provider creation and four-section config
    - Read per-account role ARN (`pulumiConfig.requireSecret(\`aws:${acct.name}:roleArn\`)`) and region (`pulumiConfig.require(\`aws:${acct.name}:region\`)`) from Pulumi stack config
    - Create one `aws.Provider` per `aws_accounts` entry using `assumeRole` with the role ARN and region
    - Store providers in `accountProviders: Record<string, aws.Provider>`
    - Iterate `config.github_teams` directly to create `GitHubTeamComponent` instances with all optional properties (description, privacy, parentTeamId, parentTeamReadId, parentTeamReadSlug, notificationSetting, ldapDn, createDefaultMaintainer)
    - Iterate `config.iam_groups` to create account-scoped `aws.iam.Group` resources with `{ provider: accountProviders[groupDef.account] }`
    - Resolve policies per group: `policy_arns` > `policy_arn` > default `ReadOnlyAccess`; create `GroupPolicyAttachment` for each resolved ARN with correct provider
    - Apply `path` and `permission_boundary` on groups when specified
    - Store groups keyed by `"accountName/groupName"` for lookup
    - Per-user loop: create one `UserComponent` per user, passing `github` config (teamSlug, orgRole, teamRole) and `iamAssignments` array (each with account, groupName, and the account's provider from `accountProviders`)
    - Remove old derived-teams/derived-groups logic and `pulumi.Config` based custom policy lookup
    - _Requirements: 1.1, 1.2, 1.10, 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 4.1, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.1, 10.1, 10.2, 10.3, 10.4_

- [x] 10. Checkpoint - Validate all components and orchestration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement integration tests with Pulumi mocks
  - [x] 11.1 Create `tests/index.test.ts` with Pulumi mock setup and unit tests
    - Set up `pulumi.runtime.setMocks()` to mock resource creation and track created resources
    - Test: two accounts, two users with multi-account iam_assignments → correct resource counts (2 providers, 2 teams, 2 user components each containing 1 membership + correct number of IAM users per assignment, correct number of IAM groups per account)
    - Test: invalid config entry → validation error
    - Test: all resource names conform to naming convention pattern
    - Test: component resources are instances of `ComponentResource`
    - Test: team with all optional properties (description, privacy, parent_team_id, etc.) passes values through to `github.Team`
    - Test: IAM group with `policy_arns` list creates multiple `GroupPolicyAttachment` resources with correct account provider
    - Test: IAM group with only `policy_arn` creates single `GroupPolicyAttachment`
    - Test: IAM group with no policy specified defaults to `ReadOnlyAccess`
    - Test: IAM group `path` and `permission_boundary` pass through to resources
    - Test: same group name in different accounts → both created successfully
    - Test: user referencing non-existent team → descriptive error
    - Test: user iam_assignment referencing non-existent account → descriptive error
    - Test: user iam_assignment referencing group not defined for that account → descriptive error
    - Test: IAM resources use correct account provider
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 11.2 Write property test for resource count matches configuration (Property 2)
    - **Property 2: Resource count matches configuration**
    - Use Pulumi mocks and fast-check to generate random valid four-section configs and verify exactly A providers, M teams, N user components (each with 1 membership), T IAM users (one per iam_assignment), K IAM groups are registered
    - **Validates: Requirements 1.10, 2.1, 3.1, 4.5, 5.1, 10.1**

  - [x] 11.3 Write property test for team membership links to correct team (Property 8)
    - **Property 8: Team membership links to correct team**
    - Use Pulumi mocks and fast-check to verify each `TeamMembership` references the correct team from `github_teams`
    - **Validates: Requirements 3.2**

  - [x] 11.4 Write property test for IAM user assigned to correct group in correct account (Property 9)
    - **Property 9: IAM user assigned to correct group in correct account**
    - Use Pulumi mocks and fast-check to verify each `UserGroupMembership` references the correct IAM group from `iam_groups` for the correct account
    - **Validates: Requirements 4.3**

  - [ ]* 11.5 Write property test for IAM group policy resolution (Property 10)
    - **Property 10: IAM group policy resolution**
    - Use Pulumi mocks and fast-check to generate random `IAMGroupEntry` objects with/without `policy_arn`/`policy_arns` and verify correct policy ARNs are attached (or default `ReadOnlyAccess`)
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [ ]* 11.6 Write property test for account provider correctness (Property 12)
    - **Property 12: Account provider correctness**
    - Use Pulumi mocks and fast-check to generate random valid configs with multiple accounts and verify each IAM resource (group, user, policy attachment) is created using the `aws.Provider` for its account
    - **Validates: Requirements 4.1, 10.2, 10.3, 10.4**

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Create Pulumi stack configuration and ESC environments
  - [ ] 13.1 Update `Pulumi.live.yaml` to reference ESC environment
    - Add `environment: [user-mgmt/live]` to reference the composed ESC environment
    - Include `usersFile` config pointing to `users.yaml`
    - No secrets stored in stack YAML — all credentials managed by ESC
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.5_

  - [ ] 13.2 Document Pulumi ESC environment setup
    - Document per-account ESC environments with `fn::open::aws-login` OIDC configuration
    - Document composed `user-mgmt/live` ESC environment that imports account environments and GitHub token
    - Document AWS IAM OIDC identity provider setup for Pulumi Cloud
    - Document IAM role trust policies for each target account
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [ ] 14. Create deploy pipeline configuration
  - [ ] 14.1 Create `.github/workflows/deploy.yml` GitHub Actions workflow
    - On `pull_request` targeting `main`: run `pulumi preview --stack live`, post results to PR
    - On `push` to `main` (only via merged PR): run `pulumi up --stack live --yes`
    - Retrieve `PULUMI_ACCESS_TOKEN` from GitHub Actions secrets (ESC handles AWS and GitHub credentials via OIDC)
    - Report "no changes" when preview detects no diff
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ] 15. Create README documentation
  - [ ] 15.1 Write `README.md` with complete project documentation
    - Document how to install dependencies (`pnpm install`) and run the Pulumi project (`pulumi up`)
    - Document how to add/remove users by editing `users.yaml`
    - Document the four-section YAML configuration structure (`aws_accounts`, `github_teams`, `iam_groups`, `users`) with all supported properties for each section
    - Document the multi-account deployment model: single `live` stack deploys to all AWS accounts, account names in YAML map to ESC environments with OIDC-based credential resolution
    - Document all assumptions made in the implementation (naming convention, default policies, org membership model)
    - Document how to configure secrets using Pulumi ESC: per-account OIDC environments, composed stack environments, GitHub token management, and AWS IAM trust policy setup
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks 1, 3, 5 are fully complete and preserved as-is
- Task 2 (config) needs significant rework: new `AWSAccountEntry` and `IAMAssignment` interfaces, four-section validation, `iam_groups` scoped to accounts with required `account` field, users with `iam_assignments` replacing `iam_group`, cross-reference validation across accounts, name+account uniqueness for groups
- Task 6 (GitHub team component) needs expansion: all `github.Team` optional properties
- Task 7 (GitHub membership) needs test verification only — code is unchanged
- Task 8 (AWS user component) needs simplification: remove `policyArn`, provider passed via `opts` for account targeting. New `UserComponent` wraps `GitHubMembershipComponent` + `AWSUserComponent` per user.
- Task 9 (entry point) needs full restructuring: per-account provider creation loop, account-scoped IAM groups, per-user `UserComponent` creation
- Task 11 (integration tests) covers 12 correctness properties (P1–P12) including new P12 for account provider correctness
- Property tests validate all 12 correctness properties from the design document
- Unit tests validate specific examples and edge cases using Pulumi mocks
- Tasks marked with `*` are optional and can be skipped for faster MVP
- All code is TypeScript; tests use Vitest + fast-check
