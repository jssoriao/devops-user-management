# Requirements Document

## Introduction

This feature implements a Pulumi infrastructure-as-code project that manages GitHub organization membership and AWS IAM users across multiple AWS accounts from a structured YAML configuration file. The configuration has four root-level sections: `aws_accounts` (account name definitions), `github_teams` (explicit team definitions with full GitHub Team properties), `iam_groups` (explicit IAM group definitions scoped to specific accounts with policy configuration), and `users` (user assignments with multi-account IAM assignments). Account names are defined in YAML but all sensitive credentials (role ARNs, regions) are stored in Pulumi stack config as secrets — no account IDs or credentials appear in source control. The system creates a separate AWS provider per account using role assumption, deploys IAM resources to the correct account in a single `pulumi up`, creates GitHub teams with all supported properties, assigns users to those teams, and validates cross-references between sections. The project uses TypeScript, Pulumi Component Resources, supports multiple environments, and includes CI pipeline configuration and unit tests.

## Glossary

- **Pulumi_Project**: The Pulumi TypeScript project that defines and deploys all infrastructure resources
- **User_Config**: A YAML configuration file with four root-level sections (`aws_accounts`, `github_teams`, `iam_groups`, `users`) that defines all accounts, teams, IAM group definitions, and user assignments
- **AWS_Account**: A named AWS account entry in the `aws_accounts` section; only the logical name is stored in YAML, while the role ARN and region are stored in Pulumi stack config as secrets
- **Account_Provider**: A Pulumi AWS provider instance created per AWS_Account using role assumption credentials from Pulumi stack config
- **GitHub_Provider**: The Pulumi GitHub provider used to manage GitHub organization resources
- **GitHub_Team_Component**: A Pulumi Component Resource that encapsulates creation of a GitHub team with all supported `github.Team` properties (name, description, privacy, parent team, notification setting, LDAP DN, create default maintainer)
- **GitHub_Membership_Component**: A Pulumi Component Resource that encapsulates adding a user to a GitHub organization and assigning the user to a GitHub team
- **AWS_User_Component**: A Pulumi Component Resource that encapsulates creation of an AWS IAM user and group membership within a specific AWS account
- **IAM_Group**: An AWS IAM group scoped to a specific AWS_Account, with configurable policy ARNs, IAM path, and optional permission boundary
- **IAM_Assignment**: A mapping on a user entry that assigns the user to a specific IAM_Group in a specific AWS_Account
- **Naming_Convention**: A deterministic rule for deriving resource names from user and team/group identifiers
- **Stack_Config**: Pulumi stack configuration that selects the target environment (dev, staging, prod) and stores per-account role ARNs as Pulumi secrets
- **Config_Validator**: The module responsible for validating the User_Config structure, field values, and cross-references between sections

## Requirements

### Requirement 1: YAML Configuration Structure

**User Story:** As a DevOps engineer, I want to define AWS accounts, users, GitHub teams, and IAM groups in separate sections of a single YAML file, so that I can manage each resource type explicitly and independently while keeping sensitive data out of source control.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL read the User_Config YAML file at deployment time
2. THE User_Config SHALL contain four root-level sections: `aws_accounts`, `github_teams`, `iam_groups`, and `users`
3. THE `aws_accounts` section SHALL define each AWS_Account with a `name` property only
4. THE `aws_accounts` section SHALL NOT contain any credentials, role ARNs, account IDs, or region information
5. THE `github_teams` section SHALL define each team with at minimum a `name` property
6. THE `iam_groups` section SHALL define each IAM group with at minimum a `name` property and a required `account` property referencing a defined AWS_Account
7. THE `users` section SHALL define each user with a `name`, a `github` object (containing required `team`, optional `role`, and optional `team_role`), and an `iam_assignments` list
8. THE `iam_assignments` list on each user SHALL contain entries with an `account` property and an `iam_group` property
9. IF the User_Config file is missing or contains invalid YAML, THEN THE Pulumi_Project SHALL fail with a descriptive error message before creating any resources
10. WHEN a user entry is added to the User_Config, THE Pulumi_Project SHALL create a GitHub membership and an AWS IAM user in each account referenced by the user's IAM_Assignments
11. WHEN a user entry is removed from the User_Config, THE Pulumi_Project SHALL remove the corresponding GitHub membership and all AWS IAM users across accounts on the next deployment

### Requirement 2: GitHub Team Management

**User Story:** As a DevOps engineer, I want to define GitHub teams explicitly with all supported properties, so that I have full control over team configuration including visibility, nesting, and notification settings.

#### Acceptance Criteria

1. THE GitHub_Team_Component SHALL create a GitHub team for each entry in the `github_teams` section of the User_Config
2. THE GitHub_Team_Component SHALL set the team name using the Naming_Convention
3. THE GitHub_Team_Component SHALL accept an optional `description` property for the team description
4. THE GitHub_Team_Component SHALL accept an optional `privacy` property with allowed values `closed` or `secret` to control team visibility
5. THE GitHub_Team_Component SHALL accept optional parent team properties (`parent_team_id`, `parent_team_read_id`, `parent_team_read_slug`) to support team nesting
6. THE GitHub_Team_Component SHALL accept an optional `notification_setting` property to configure team notification preferences
7. THE GitHub_Team_Component SHALL accept an optional `ldap_dn` property for LDAP distinguished name mapping
8. THE GitHub_Team_Component SHALL accept an optional `create_default_maintainer` boolean property
9. WHEN a team entry is no longer present in the `github_teams` section, THE Pulumi_Project SHALL remove the corresponding GitHub team on the next deployment
10. THE GitHub_Team_Component SHALL be implemented as a Pulumi Component Resource

### Requirement 3: GitHub User Assignment

**User Story:** As a DevOps engineer, I want each user to be added to the GitHub organization and assigned to the correct team, so that repository access is managed through code.

#### Acceptance Criteria

1. WHEN a user entry exists in the User_Config, THE GitHub_Membership_Component SHALL add the user to the GitHub organization
2. WHEN a user entry specifies a `github.team`, THE GitHub_Membership_Component SHALL assign the user to the corresponding GitHub team defined in the `github_teams` section
3. THE GitHub_Membership_Component SHALL set the organization membership role to `member` by default, configurable via the optional `github.role` property (allowed values: `member`, `admin`)
4. THE GitHub_Membership_Component SHALL set the team membership role to `member` by default, configurable via the optional `github.team_role` property (allowed values: `member`, `maintainer`)
5. THE Config_Validator SHALL reject `github.role` values other than `member` or `admin` with a descriptive error
6. THE Config_Validator SHALL reject `github.team_role` values other than `member` or `maintainer` with a descriptive error
7. THE GitHub_Membership_Component SHALL be implemented as a Pulumi Component Resource
8. THE GitHub_Membership_Component SHALL derive the GitHub username from the user name using the Naming_Convention

### Requirement 4: AWS IAM User Management (Multi-Account)

**User Story:** As a DevOps engineer, I want AWS IAM users to be provisioned automatically in the correct AWS accounts based on their IAM assignments, so that multi-account AWS access is managed through code.

#### Acceptance Criteria

1. WHEN a user entry has an IAM_Assignment for a given AWS_Account, THE AWS_User_Component SHALL create an AWS IAM user in that account using the corresponding Account_Provider
2. THE AWS_User_Component SHALL name the IAM user using the Naming_Convention
3. WHEN a user's IAM_Assignment specifies an `iam_group`, THE AWS_User_Component SHALL add the IAM user to the corresponding IAM_Group defined in the `iam_groups` section for that account
4. THE AWS_User_Component SHALL be implemented as a Pulumi Component Resource
5. WHEN a user has multiple IAM_Assignments across different AWS_Accounts, THE Pulumi_Project SHALL create a separate IAM user in each referenced account

### Requirement 5: IAM Group Configuration and Policy Attachment (Account-Scoped)

**User Story:** As a DevOps engineer, I want to define IAM groups scoped to specific AWS accounts with custom policies, paths, and permission boundaries, so that I can enforce least-privilege access per group per account.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL create an IAM_Group for each entry in the `iam_groups` section of the User_Config, using the Account_Provider for the account specified in the group's `account` property
2. THE `iam_groups` section SHALL support an optional `policy_arn` property to specify a single managed policy ARN for the group
3. THE `iam_groups` section SHALL support an optional `policy_arns` list property to specify multiple managed policy ARNs for the group
4. WHEN an IAM group entry specifies neither `policy_arn` nor `policy_arns`, THE Pulumi_Project SHALL attach the `arn:aws:iam::aws:policy/ReadOnlyAccess` managed policy by default
5. THE `iam_groups` section SHALL support an optional `path` property to set the IAM path for the group
6. THE `iam_groups` section SHALL support an optional `permission_boundary` property to set a permission boundary policy ARN for users in the group
7. THE Pulumi_Project SHALL use AWS managed policy ARNs where applicable to follow least-privilege principles
8. THE Pulumi_Project SHALL allow the same IAM group name to appear multiple times in the `iam_groups` section when each entry references a different `account`

### Requirement 6: Cross-Reference Validation (Multi-Account)

**User Story:** As a DevOps engineer, I want the system to validate that all references between sections are consistent, so that misconfigurations are caught before deployment.

#### Acceptance Criteria

1. WHEN a user's IAM_Assignment references an `account` value that does not match any `name` in the `aws_accounts` section, THE Config_Validator SHALL fail with a descriptive error identifying the unresolved account reference
2. WHEN a user's IAM_Assignment references an `iam_group` value that does not match any IAM group defined for that specific account in the `iam_groups` section, THE Config_Validator SHALL fail with a descriptive error identifying the unresolved group reference and the account
3. WHEN a user entry references a `github_team` value that does not match any `name` in the `github_teams` section, THE Config_Validator SHALL fail with a descriptive error identifying the unresolved reference
4. WHEN an `iam_groups` entry references an `account` value that does not match any `name` in the `aws_accounts` section, THE Config_Validator SHALL fail with a descriptive error identifying the unresolved account reference
5. THE Config_Validator SHALL validate that all account, team, group, and user names conform to the Naming_Convention pattern
6. THE Config_Validator SHALL validate that no duplicate names exist within the `aws_accounts` section
7. THE Config_Validator SHALL validate that no duplicate names exist within the `github_teams` section
8. THE Config_Validator SHALL validate that no duplicate `name`+`account` pairs exist within the `iam_groups` section
9. THE Config_Validator SHALL validate that no duplicate user names exist within the `users` section

### Requirement 7: Naming Convention Enforcement

**User Story:** As a DevOps engineer, I want all resource names to follow a consistent naming convention, so that resources are identifiable and predictable.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL prefix all resource names with the current Pulumi stack name
2. THE Naming_Convention SHALL produce lowercase alphanumeric names with hyphens as separators
3. IF a name in the User_Config contains characters outside the allowed set, THEN THE Pulumi_Project SHALL fail with a descriptive validation error before creating any resources

### Requirement 8: Multi-Environment Support

**User Story:** As a DevOps engineer, I want to deploy the same configuration to different environments, so that I can manage dev, staging, and production separately.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL support separate Pulumi stacks for dev, staging, and prod environments
2. WHEN a stack is selected, THE Pulumi_Project SHALL use the stack name to namespace all created resources
3. THE Pulumi_Project SHALL allow each stack to reference its own User_Config file or a shared one with environment overrides

### Requirement 9: Secret Management (Multi-Account)

**User Story:** As a DevOps engineer, I want all sensitive credentials stored securely outside of YAML configuration, so that secrets are not exposed in source control or logs.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL store the GitHub provider token as a Pulumi secret
2. THE Pulumi_Project SHALL store per-account AWS role ARNs as Pulumi secrets in the stack configuration
3. THE Pulumi_Project SHALL retrieve per-account region configuration from the Pulumi stack configuration
4. THE User_Config YAML file SHALL NOT contain any AWS account IDs, role ARNs, access keys, or region information
5. THE Pulumi_Project SHALL support AWS credentials via environment variables or role assumption for the initial provider bootstrap
6. THE Pulumi_Project SHALL ensure no secret values appear in plaintext in Pulumi state or stack outputs

### Requirement 10: Multi-Account AWS Provider Management

**User Story:** As a DevOps engineer, I want the system to create a separate AWS provider per account using role assumption, so that all accounts are deployed in a single `pulumi up` run.

#### Acceptance Criteria

1. WHEN the Pulumi_Project deploys, THE Pulumi_Project SHALL create one Account_Provider per entry in the `aws_accounts` section
2. THE Account_Provider SHALL assume the IAM role specified by the role ARN stored in the Pulumi stack configuration for that account name
3. THE Account_Provider SHALL use the region specified in the Pulumi stack configuration for that account name
4. THE Pulumi_Project SHALL pass the correct Account_Provider to all IAM resources (groups, users, policy attachments) scoped to that account
5. IF the role ARN for an account is missing from the Pulumi stack configuration, THEN THE Pulumi_Project SHALL fail with a descriptive error identifying the account with the missing configuration
6. THE Pulumi_Project SHALL deploy IAM resources for all configured accounts in a single `pulumi up` execution

### Requirement 11: CI Pipeline

**User Story:** As a DevOps engineer, I want a CI pipeline that automatically deploys changes, so that infrastructure updates are applied consistently.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL include a CI pipeline configuration file (e.g., GitHub Actions workflow)
2. WHEN a pull request is opened or updated targeting the main branch, THE CI pipeline SHALL run `pulumi preview` and post the results to the pull request
3. WHEN a pull request is merged into the main branch, THE CI pipeline SHALL run `pulumi up` to apply the changes
4. THE CI pipeline SHALL retrieve secrets from the CI environment secret store rather than from the repository
5. IF `pulumi preview` detects no changes, THEN THE CI pipeline SHALL report no changes on the pull request
6. THE CI pipeline SHALL NOT allow direct pushes to the main branch to trigger `pulumi up` without a preceding pull request

### Requirement 12: Unit Testing

**User Story:** As a DevOps engineer, I want unit tests that validate resource creation logic using Pulumi mocks, so that I can catch configuration errors before deployment.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL include unit tests that use Pulumi mock infrastructure
2. WHEN a User_Config with users having IAM_Assignments across multiple AWS_Accounts is provided, THE unit tests SHALL verify that the correct number of IAM users and group memberships are created per account
3. WHEN a User_Config with an invalid entry is provided, THE unit tests SHALL verify that the Pulumi_Project produces a validation error
4. THE unit tests SHALL verify that all resource names conform to the Naming_Convention
5. THE unit tests SHALL verify that each Account_Provider is used for the correct account's resources

### Requirement 13: Project Documentation

**User Story:** As a DevOps engineer, I want a README that explains how to run the project and manage users across multiple accounts, so that new team members can onboard quickly.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL include a README file in the repository root
2. THE README SHALL document how to install dependencies and run the Pulumi project
3. THE README SHALL document how to add or remove users by editing the User_Config
4. THE README SHALL document the four-section YAML configuration structure (`aws_accounts`, `github_teams`, `iam_groups`, `users`) with all supported properties
5. THE README SHALL document the multi-account deployment model, including how account names in YAML map to role ARNs in Pulumi stack config
6. THE README SHALL document all assumptions made in the implementation
7. THE README SHALL document how to configure secrets for GitHub and AWS providers, including per-account role ARN secrets in stack config
