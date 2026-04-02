# Requirements Document

## Introduction

This feature implements a Pulumi infrastructure-as-code project that manages GitHub organization membership and AWS IAM users from a single YAML configuration file. The system creates GitHub teams, assigns users to those teams, provisions AWS IAM users, assigns them to IAM groups representing AWS accounts/environments, and attaches least-privilege IAM policies. The project uses TypeScript, Pulumi Component Resources, supports multiple environments, and includes CI pipeline configuration and unit tests.

## Glossary

- **Pulumi_Project**: The Pulumi TypeScript project that defines and deploys all infrastructure resources
- **User_Config**: A YAML configuration file that defines all users, their GitHub team assignments, and AWS account assignments
- **GitHub_Provider**: The Pulumi GitHub provider used to manage GitHub organization resources
- **AWS_Provider**: The Pulumi AWS provider used to manage AWS IAM resources
- **GitHub_Team_Component**: A Pulumi Component Resource that encapsulates creation of a GitHub team
- **GitHub_Membership_Component**: A Pulumi Component Resource that encapsulates adding a user to a GitHub organization and assigning the user to a GitHub team
- **AWS_User_Component**: A Pulumi Component Resource that encapsulates creation of an AWS IAM user, group membership, and policy attachment
- **IAM_Group**: An AWS IAM group representing an account or environment boundary (e.g., dev-account, prod-account)
- **Naming_Convention**: A deterministic rule for deriving resource names from user and team/group identifiers
- **Stack_Config**: Pulumi stack configuration that selects the target environment (dev, staging, prod)

## Requirements

### Requirement 1: User Configuration File

**User Story:** As a DevOps engineer, I want to define all users and their assignments in a single YAML file, so that I can manage infrastructure users declaratively without modifying code.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL read user definitions from a single User_Config YAML file at deployment time
2. WHEN the User_Config file contains a user entry, THE Pulumi_Project SHALL create both a GitHub membership and an AWS IAM user for that entry
3. WHEN a user entry is removed from the User_Config file, THE Pulumi_Project SHALL remove the corresponding GitHub membership and AWS IAM user on the next deployment
4. THE User_Config SHALL define each user with a name, a github_team assignment, and an aws_account assignment
5. IF the User_Config file is missing or contains invalid YAML, THEN THE Pulumi_Project SHALL fail with a descriptive error message before creating any resources

### Requirement 2: GitHub Team Management

**User Story:** As a DevOps engineer, I want GitHub teams to be created automatically from configuration, so that team structure stays in sync with the declared state.

#### Acceptance Criteria

1. THE GitHub_Team_Component SHALL create a GitHub team for each unique github_team value found in the User_Config
2. THE GitHub_Team_Component SHALL set the team name using the Naming_Convention
3. WHEN a github_team value is no longer referenced by any user in the User_Config, THE Pulumi_Project SHALL remove the corresponding GitHub team on the next deployment
4. THE GitHub_Team_Component SHALL be implemented as a Pulumi Component Resource

### Requirement 3: GitHub User Assignment

**User Story:** As a DevOps engineer, I want each user to be added to the GitHub organization and assigned to the correct team, so that repository access is managed through code.

#### Acceptance Criteria

1. WHEN a user entry exists in the User_Config, THE GitHub_Membership_Component SHALL add the user to the GitHub organization
2. WHEN a user entry specifies a github_team, THE GitHub_Membership_Component SHALL assign the user to the corresponding GitHub team
3. THE GitHub_Membership_Component SHALL set the membership role to "member" by default
4. THE GitHub_Membership_Component SHALL be implemented as a Pulumi Component Resource
5. THE GitHub_Membership_Component SHALL derive the GitHub username from the user name using the Naming_Convention

### Requirement 4: AWS IAM User Management

**User Story:** As a DevOps engineer, I want AWS IAM users to be provisioned automatically and assigned to the correct IAM group, so that AWS access is managed through code.

#### Acceptance Criteria

1. WHEN a user entry exists in the User_Config, THE AWS_User_Component SHALL create an AWS IAM user
2. THE AWS_User_Component SHALL name the IAM user using the Naming_Convention
3. WHEN a user entry specifies an aws_account, THE AWS_User_Component SHALL add the IAM user to the corresponding IAM_Group
4. THE AWS_User_Component SHALL create the IAM_Group if the group does not already exist
5. THE AWS_User_Component SHALL be implemented as a Pulumi Component Resource

### Requirement 5: IAM Policy Attachment

**User Story:** As a DevOps engineer, I want each IAM group to have a least-privilege policy attached, so that users only get the access they need.

#### Acceptance Criteria

1. THE AWS_User_Component SHALL attach an IAM policy to each IAM_Group
2. THE Pulumi_Project SHALL attach a read-only access policy to IAM groups by default
3. WHEN the User_Config or Stack_Config specifies a custom policy ARN for a group, THE AWS_User_Component SHALL attach the specified policy instead of the default
4. THE Pulumi_Project SHALL use AWS managed policy ARNs where applicable to follow least-privilege principles

### Requirement 6: Naming Convention Enforcement

**User Story:** As a DevOps engineer, I want all resource names to follow a consistent naming convention, so that resources are identifiable and predictable.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL prefix all resource names with the current Pulumi stack name
2. THE Naming_Convention SHALL produce lowercase alphanumeric names with hyphens as separators
3. IF a user name in the User_Config contains characters outside the allowed set, THEN THE Pulumi_Project SHALL fail with a descriptive validation error before creating any resources

### Requirement 7: Multi-Environment Support

**User Story:** As a DevOps engineer, I want to deploy the same configuration to different environments, so that I can manage dev, staging, and production separately.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL support separate Pulumi stacks for dev, staging, and prod environments
2. WHEN a stack is selected, THE Pulumi_Project SHALL use the stack name to namespace all created resources
3. THE Pulumi_Project SHALL allow each stack to reference its own User_Config file or a shared one with environment overrides

### Requirement 8: Secret Management

**User Story:** As a DevOps engineer, I want sensitive credentials to be stored securely, so that secrets are not exposed in source control or logs.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL store the GitHub provider token as a Pulumi secret
2. THE Pulumi_Project SHALL store AWS credentials using Pulumi secret configuration or environment variables
3. THE Pulumi_Project SHALL ensure no secret values appear in plaintext in Pulumi state or stack outputs

### Requirement 9: CI Pipeline

**User Story:** As a DevOps engineer, I want a CI pipeline that automatically deploys changes, so that infrastructure updates are applied consistently.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL include a CI pipeline configuration file (e.g., GitHub Actions workflow)
2. WHEN a pull request is opened or updated targeting the main branch, THE CI pipeline SHALL run `pulumi preview` and post the results to the pull request
3. WHEN a pull request is merged into the main branch, THE CI pipeline SHALL run `pulumi up` to apply the changes
4. THE CI pipeline SHALL retrieve secrets from the CI environment secret store rather than from the repository
5. IF `pulumi preview` detects no changes, THEN THE CI pipeline SHALL report no changes on the pull request
6. THE CI pipeline SHALL NOT allow direct pushes to the main branch to trigger `pulumi up` without a preceding pull request

### Requirement 10: Unit Testing

**User Story:** As a DevOps engineer, I want unit tests that validate resource creation logic using Pulumi mocks, so that I can catch configuration errors before deployment.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL include unit tests that use Pulumi mock infrastructure
2. WHEN a User_Config with two users and two teams is provided, THE unit tests SHALL verify that two GitHub team resources, two GitHub membership resources, two IAM user resources, and the corresponding IAM group resources are created
3. WHEN a User_Config with an invalid entry is provided, THE unit tests SHALL verify that the Pulumi_Project produces a validation error
4. THE unit tests SHALL verify that all resource names conform to the Naming_Convention

### Requirement 11: Project Documentation

**User Story:** As a DevOps engineer, I want a README that explains how to run the project and manage users, so that new team members can onboard quickly.

#### Acceptance Criteria

1. THE Pulumi_Project SHALL include a README file in the repository root
2. THE README SHALL document how to install dependencies and run the Pulumi project
3. THE README SHALL document how to add or remove users by editing the User_Config
4. THE README SHALL document all assumptions made in the implementation
5. THE README SHALL document how to configure secrets for GitHub and AWS providers
