# devops-user-management

A Pulumi TypeScript project that manages GitHub organization membership and AWS IAM users across multiple AWS accounts from a single YAML configuration file.

A single `pulumi up` on the `live` stack provisions GitHub teams, org/team memberships, and per-account IAM users/groups/policies — all driven by `users.yaml`.

## Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10+
- [Pulumi CLI](https://www.pulumi.com/docs/install/) v3.220.0+ (required for `envVarMappings`)
- Pulumi Cloud account (for state storage and ESC)
- AWS CLI (for initial IAM OIDC setup in each account)
- GitHub personal access token with `admin:org` scope

## Getting Started

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Preview changes
pulumi preview --stack live

# Deploy
pulumi up --stack live
```

## Configuration

All user, team, group, and account definitions live in `users.yaml`. The file has four root-level sections:

### `aws_accounts`

Defines the logical AWS accounts the project deploys to. Only the name is stored here — credentials are managed by Pulumi ESC (see [Secret Management](#secret-management)).

```yaml
aws_accounts:
  - name: dev
  - name: prod
```

### `github_teams`

Defines GitHub teams to create in the organization. Each entry requires a `name` and supports all optional `github.Team` properties:

| Property                    | Required | Description                                     |
| --------------------------- | -------- | ----------------------------------------------- |
| `name`                      | yes      | Team slug (lowercase alphanumeric with hyphens) |
| `description`               | no       | Team description                                |
| `privacy`                   | no       | `closed` or `secret`                            |
| `parent_team_id`            | no       | Numeric ID of the parent team                   |
| `parent_team_read_id`       | no       | Numeric ID of the parent team (read-only)       |
| `parent_team_read_slug`     | no       | Slug of the parent team (read-only)             |
| `notification_setting`      | no       | Team notification preference                    |
| `ldap_dn`                   | no       | LDAP distinguished name                         |
| `create_default_maintainer` | no       | Boolean — create a default maintainer           |

```yaml
github_teams:
  - name: backend
    description: "Backend engineering team"
    privacy: closed
  - name: platform
    parent_team_read_slug: engineering
    create_default_maintainer: false
```

### `iam_groups`

Defines IAM groups scoped to specific AWS accounts. The same group name can appear multiple times if each entry targets a different account.

| Property              | Required | Description                                      |
| --------------------- | -------- | ------------------------------------------------ |
| `name`                | yes      | Group name (lowercase alphanumeric with hyphens) |
| `account`             | yes      | Must reference a name in `aws_accounts`          |
| `policy_arn`          | no       | Single managed policy ARN                        |
| `policy_arns`         | no       | List of managed policy ARNs                      |
| `path`                | no       | IAM path for the group                           |
| `permission_boundary` | no       | Permission boundary policy ARN                   |

If neither `policy_arn` nor `policy_arns` is specified, the group defaults to `arn:aws:iam::aws:policy/ReadOnlyAccess`.

When `policy_arns` is provided it takes precedence over `policy_arn`.

```yaml
iam_groups:
  - name: backend-developers
    account: dev
    policy_arns:
      - "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
      - "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess"
    path: "/engineering/"
  - name: backend-developers
    account: prod
    policy_arn: "arn:aws:iam::aws:policy/ReadOnlyAccess"
  - name: readonly-users
    account: dev
    # Defaults to ReadOnlyAccess
```

### `users`

Defines users to provision across GitHub and AWS. Each user gets a GitHub org membership, a team assignment, and one or more IAM users in the specified accounts.

| Property                      | Required | Description                                          |
| ----------------------------- | -------- | ---------------------------------------------------- |
| `name`                        | yes      | Username (lowercase alphanumeric with hyphens)       |
| `github.team`                 | yes      | Must reference a name in `github_teams`              |
| `github.role`                 | no       | Org membership role: `member` (default) or `admin`   |
| `github.team_role`            | no       | Team role: `member` (default) or `maintainer`        |
| `iam_assignments`             | yes      | Non-empty list of account/group assignments          |
| `iam_assignments[].account`   | yes      | Must reference a name in `aws_accounts`              |
| `iam_assignments[].iam_group` | yes      | Must reference an IAM group defined for that account |

```yaml
users:
  - name: alice
    github:
      team: backend
      role: admin
      team_role: maintainer
    iam_assignments:
      - account: dev
        iam_group: backend-developers
      - account: prod
        iam_group: backend-developers
  - name: bob
    github:
      team: frontend
    iam_assignments:
      - account: dev
        iam_group: frontend-developers
```

## Managing Users

To add a user, append an entry to the `users` section in `users.yaml` and run `pulumi up`. The system creates the GitHub membership and IAM users in all referenced accounts.

To remove a user, delete their entry from `users.yaml` and run `pulumi up`. Pulumi removes the corresponding GitHub membership and all IAM users across accounts.

To change a user's team or account assignments, edit their entry and redeploy.

## Multi-Account Deployment Model

The project uses a single `live` Pulumi stack that deploys to all AWS accounts in one operation.

Account names in `users.yaml` are purely logical identifiers. At deploy time:

1. Pulumi ESC resolves per-account OIDC credentials and injects them as prefixed environment variables (e.g., `DEV_AWS_ACCESS_KEY_ID`, `PROD_AWS_ACCESS_KEY_ID`)
2. `index.ts` creates one `aws.Provider` per account using `envVarMappings` to remap the prefixed env vars to the standard `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`
3. IAM groups, users, and policy attachments are created with the correct account's provider

The env var prefix is derived from the account name: uppercased with hyphens replaced by underscores (e.g., `dev` → `DEV_`, `my-staging` → `MY_STAGING_`).

## Secret Management

All credentials are managed through [Pulumi ESC](https://www.pulumi.com/docs/esc/) with OIDC-based authentication. No long-lived secrets exist in source control, stack config files, or CI secrets.

The only CI secret required is `PULUMI_ACCESS_TOKEN`. AWS and GitHub credentials are resolved dynamically by ESC via OIDC at deploy time.

### ESC Environment Structure

| ESC Environment      | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `user-mgmt/aws-dev`  | OIDC login for dev AWS account              |
| `user-mgmt/aws-prod` | OIDC login for prod AWS account             |
| `user-mgmt/github`   | GitHub token (stored as ESC secret)         |
| `user-mgmt/live`     | Composed env for live stack (imports above) |

Each per-account ESC environment uses `fn::open::aws-login` with OIDC to obtain short-lived STS credentials. The composed `user-mgmt/live` environment imports all account environments and the GitHub token, then exposes them as `pulumiConfig` values (regions) and `environmentVariables` (credentials).

### Setup

Full step-by-step instructions for setting up OIDC identity providers, IAM roles, trust policies, and ESC environments are in [`docs/pulumi-esc-setup.md`](docs/pulumi-esc-setup.md).

### Adding a New AWS Account

1. Create the OIDC identity provider and IAM role in the new AWS account
2. Create a per-account ESC environment: `pulumi env init <org>/user-mgmt/aws-<name>`
3. Add the import, region config, and credential env vars to `user-mgmt/live`
4. Add the account to `aws_accounts` in `users.yaml`
5. Run `pulumi up`

## Validation

The config loader validates `users.yaml` before any resources are created:

- All four sections (`aws_accounts`, `github_teams`, `iam_groups`, `users`) must be present and non-empty arrays
- All names must match the pattern `/^[a-z0-9]+(-[a-z0-9]+)*$/`
- No duplicate names within `aws_accounts`, `github_teams`, or `users`
- No duplicate `name`+`account` pairs within `iam_groups`
- Every `iam_groups[].account` must reference a defined account
- Every `users[].github.team` must reference a defined team
- Every `users[].iam_assignments[].account` must reference a defined account
- Every `users[].iam_assignments[].iam_group` must reference a group defined for that specific account

If validation fails, the deployment aborts with a descriptive error message.

## CI / CD

Two GitHub Actions workflows are included:

- `ci.yml` — Runs on every push and PR: format check, lint, and tests
- `deploy.yml` — On PR to `main`: runs `pulumi preview` and posts results to the PR. On merge to `main`: runs `pulumi up --stack live`

The deploy workflow only needs `PULUMI_ACCESS_TOKEN` as a GitHub Actions secret. All other credentials are resolved by ESC.

## Development

```bash
pnpm install          # Install dependencies
pnpm test             # Run tests (vitest)
pnpm lint             # Run ESLint
pnpm format           # Format with Prettier
pnpm check            # All of the above
```

Tests use [Vitest](https://vitest.dev/) with [fast-check](https://fast-check.dev/) for property-based testing and Pulumi mocks for integration tests.

## Naming Convention

All resource names are prefixed with the Pulumi stack name and use lowercase alphanumeric characters with hyphens:

| Resource         | Pattern                                  | Example (`live` stack)                 |
| ---------------- | ---------------------------------------- | -------------------------------------- |
| AWS Provider     | `{stack}-{account}-provider`             | `live-dev-provider`                    |
| GitHub Team      | `{stack}-{team}`                         | `live-backend`                         |
| User Component   | `{stack}-{username}`                     | `live-alice`                           |
| IAM User         | `{stack}-{username}-{account}-aws`       | `live-alice-dev-aws`                   |
| IAM Group        | `{stack}-{account}-{group}`              | `live-dev-backend-developers`          |
| IAM Group Policy | `{stack}-{account}-{group}-policy-{idx}` | `live-dev-backend-developers-policy-0` |

## Assumptions

- GitHub org membership defaults to `member` role unless explicitly set to `admin`
- GitHub team membership defaults to `member` role unless explicitly set to `maintainer`
- IAM groups without an explicit policy get `arn:aws:iam::aws:policy/ReadOnlyAccess`
- When `policy_arns` is provided on a group, `policy_arn` is ignored
- Each user must have at least one IAM assignment
- Account names in YAML are logical identifiers only — no AWS account IDs or credentials are stored in the repo
- The project uses a single `live` stack; multi-stack environments (dev/staging/prod stacks) are not currently supported
- Pulumi ESC with OIDC is the only supported credential mechanism
