# Implementation Plan: Pulumi User Management

## Overview

Incrementally build a Pulumi TypeScript project that manages GitHub teams/memberships and AWS IAM users/groups from a single YAML config. Each task builds on the previous, starting with project scaffolding and config loading, then component resources, orchestration, testing, CI pipeline, and documentation.

## Tasks

- [x] 1. Initialize project structure and dependencies
  - Create `Pulumi.yaml` with project name `devops-user-management` and runtime `nodejs`
  - Create `package.json` with dependencies: `@pulumi/pulumi`, `@pulumi/github`, `@pulumi/aws`, `js-yaml`, and devDependencies: `typescript`, `vitest`, `fast-check`, `@types/js-yaml`
  - Create `tsconfig.json` with strict mode, ES2020 target, and module resolution
  - Create empty `src/` and `tests/` directories with placeholder files
  - _Requirements: 1.1, 10.1_

- [x] 2. Implement configuration loading and validation
  - [x] 2.1 Create `src/config.ts` with `UserEntry` and `UsersConfig` interfaces
    - Implement `loadConfig(filePath: string): UsersConfig` using `js-yaml` to parse the YAML file synchronously
    - Implement `validateConfig(config: UsersConfig): void` that checks: each user has `name`, `github_team`, `aws_account`; each `name` matches `/^[a-z0-9]+(-[a-z0-9]+)*$/`; no duplicate names
    - Throw descriptive errors for missing file, invalid YAML, missing fields, invalid characters, and duplicate names
    - _Requirements: 1.1, 1.4, 1.5, 6.3_

  - [x] 2.2 Create sample `users.yaml` configuration file
    - Include at least two users with different `github_team` and `aws_account` values (e.g., alice/backend/dev, bob/frontend/prod)
    - _Requirements: 1.4_

  - [x]* 2.3 Write property test for config round-trip (Property 1)
    - **Property 1: Config loading round-trip**
    - Use fast-check to generate random valid `UsersConfig` objects, serialize to YAML, load with `loadConfig`, and assert equivalence
    - **Validates: Requirements 1.1**

  - [x]* 2.4 Write property test for config validation rejects invalid input (Property 4)
    - **Property 4: Config validation rejects invalid input**
    - Use fast-check to generate user entries with missing fields or invalid characters and assert `validateConfig` throws
    - **Validates: Requirements 1.4, 1.5, 6.3**

- [x] 3. Implement naming convention utility
  - [x] 3.1 Create `src/naming.ts` with `resourceName(stackName: string, ...parts: string[]): string`
    - Concatenate stack name and parts with hyphens, all lowercase
    - Validate all parts conform to `/^[a-z0-9]+(-[a-z0-9]+)*$/` and throw on invalid input
    - _Requirements: 6.1, 6.2_

  - [x]* 3.2 Write property test for naming convention output format (Property 3)
    - **Property 3: Naming convention output format**
    - Use fast-check to generate random valid stack names and name parts, assert output matches `/^[a-z0-9]+(-[a-z0-9]+)*$/` and starts with stack name
    - **Validates: Requirements 6.1, 6.2, 2.2, 3.5, 4.2, 7.2**

- [ ] 4. Checkpoint - Validate config and naming modules
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement GitHub Team Component Resource
  - [x] 5.1 Create `src/github-team.ts` with `GitHubTeamComponent` extending `pulumi.ComponentResource`
    - Accept `GitHubTeamComponentArgs` with `teamSlug` and optional `description`
    - Create a `github.Team` resource with name derived via `resourceName`
    - Register outputs on the component
    - _Requirements: 2.1, 2.2, 2.4_

- [ ] 6. Implement GitHub Membership Component Resource
  - [ ] 6.1 Create `src/github-membership.ts` with `GitHubMembershipComponent` extending `pulumi.ComponentResource`
    - Accept `GitHubMembershipComponentArgs` with `username`, `teamSlug`, and optional `role` (default `"member"`)
    - Create `github.Membership` for org-level membership and `github.TeamMembership` for team assignment
    - Derive GitHub username from user name using the naming convention
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 6.2 Write property test for default membership role (Property 6)
    - **Property 6: Default membership role**
    - Use Pulumi mocks and fast-check to verify that memberships created without explicit role have role `"member"`
    - **Validates: Requirements 3.3**

- [ ] 7. Implement AWS User Component Resource
  - [ ] 7.1 Create `src/aws-user.ts` with `AWSUserComponent` extending `pulumi.ComponentResource`
    - Accept `AWSUserComponentArgs` with `username`, `groupName`, and optional `policyArn`
    - Create `aws.iam.User` and `aws.iam.UserGroupMembership`
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [ ] 8. Implement main entry point and orchestration
  - [ ] 8.1 Create `index.ts` that wires all components together
    - Load and validate config using `loadConfig` and `validateConfig`
    - Get stack name via `pulumi.getStack()`
    - Derive unique teams from `github_team` values and create `GitHubTeamComponent` for each
    - Derive unique groups from `aws_account` values and create `aws.iam.Group` + `aws.iam.GroupPolicyAttachment` (default `ReadOnlyAccess`) for each
    - Support custom policy ARN from stack config per group
    - Iterate users and create `GitHubMembershipComponent` and `AWSUserComponent` for each, with correct `dependsOn`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 3.1, 3.2, 4.1, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.1, 7.2_

  - [ ]* 8.2 Write property test for resource count matches configuration (Property 2)
    - **Property 2: Resource count matches configuration**
    - Use Pulumi mocks and fast-check to generate random valid configs and verify exactly N memberships, N AWS users, M teams, K groups are registered
    - **Validates: Requirements 1.2, 2.1, 3.1, 4.1, 4.4**

  - [ ]* 8.3 Write property test for team membership links to correct team (Property 5)
    - **Property 5: Team membership links to correct team**
    - Use Pulumi mocks and fast-check to verify each `TeamMembership` references the correct team
    - **Validates: Requirements 3.2**

  - [ ]* 8.4 Write property test for IAM user assigned to correct group (Property 7)
    - **Property 7: IAM user assigned to correct group**
    - Use Pulumi mocks and fast-check to verify each `UserGroupMembership` references the correct IAM group
    - **Validates: Requirements 4.3**

  - [ ]* 8.5 Write property test for default policy attachment per IAM group (Property 8)
    - **Property 8: Default policy attachment per IAM group**
    - Use Pulumi mocks and fast-check to verify each group without custom policy has `ReadOnlyAccess` ARN attached
    - **Validates: Requirements 5.1, 5.2**

- [ ] 9. Checkpoint - Validate all components and orchestration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Create Pulumi stack configuration files
  - [ ] 10.1 Create `Pulumi.dev.yaml`, `Pulumi.staging.yaml`, and `Pulumi.prod.yaml`
    - Each stack config references `usersFile` (path to `users.yaml` or environment-specific override)
    - Include placeholder for `github:token` as a Pulumi secret
    - Set `aws:region`
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_

- [ ] 11. Implement unit tests with Pulumi mocks
  - [ ] 11.1 Create `tests/index.test.ts` with Pulumi mock setup
    - Set up `pulumi.runtime.setMocks()` to mock resource creation
    - Test: two users/two teams config produces correct resource counts (2 teams, 2 memberships, 2 IAM users, corresponding groups)
    - Test: invalid config entry produces validation error
    - Test: all resource names conform to naming convention pattern
    - Test: component resources are instances of `ComponentResource`
    - Test: custom policy ARN overrides default `ReadOnlyAccess`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 12. Create CI pipeline configuration
  - [ ] 12.1 Create `.github/workflows/deploy.yml` GitHub Actions workflow
    - On `pull_request` targeting `main`: run `pulumi preview`, post results to PR
    - On `push` to `main` (only via merged PR): run `pulumi up --yes`
    - Retrieve `PULUMI_ACCESS_TOKEN`, `GITHUB_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` from GitHub Actions secrets
    - Include step to install dependencies and run tests before preview/deploy
    - Report "no changes" when preview detects no diff
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 13. Create README documentation
  - [ ] 13.1 Write `README.md` with complete project documentation
    - Document how to install dependencies (`npm install`) and run the Pulumi project (`pulumi up`)
    - Document how to add/remove users by editing `users.yaml`
    - Document assumptions (naming convention, default policies, org membership model)
    - Document how to configure secrets for GitHub and AWS providers (Pulumi config secrets, CI environment variables)
    - Document multi-environment usage with Pulumi stacks
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases using Pulumi mocks
- All code is TypeScript; tests use Vitest + fast-check
