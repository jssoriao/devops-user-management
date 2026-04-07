# Pulumi ESC Setup Guide

This guide walks through setting up Pulumi ESC with OIDC-based authentication for multi-account AWS deployments. After completing these steps, `pulumi up` will automatically obtain short-lived credentials for each AWS account — no long-lived keys needed.

ESC performs the OIDC login per account and injects the temporary credentials as environment variables. Each `aws.Provider` in `index.ts` uses `envVarMappings` to pick up the correct account's credentials. No `assumeRole` needed in the Pulumi code.

> **Account naming convention:** Account names in `users.yaml` (e.g., `dev`, `prod`) drive the environment variable prefix. The prefix is the account name uppercased with hyphens replaced by underscores (e.g., `dev` → `DEV_`, `prod` → `PROD_`). ESC environment names and env var keys must match this convention.

## Prerequisites

- Pulumi CLI v3.220.0+ (required for `envVarMappings`)
- Pulumi CLI logged in to Pulumi Cloud
- AWS CLI configured with access to each target account (for initial IAM setup)
- A Pulumi Cloud organization (referred to as `<your-org>` below)

## Step 1: Create OIDC Identity Provider in AWS

Run this in **each** AWS account (dev, prod). This tells AWS to trust tokens from Pulumi Cloud.

```bash
aws iam create-open-id-connect-provider \
  --url https://api.pulumi.com/oidc \
  --client-id-list "aws:<your-org>" \
  --thumbprint-list "9e99a48a9960b14926bb7f3b02e22da2b0ab7280"
```

Replace `<your-org>` with your Pulumi Cloud organization name.

## Step 2: Create IAM Role in Each Account

Create a role that Pulumi ESC can assume via OIDC. The role name should follow a consistent pattern per account (e.g., `pulumi-user-mgmt-deploy`). Save this as `trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/api.pulumi.com/oidc"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "api.pulumi.com/oidc:aud": "aws:<your-org>"
        }
      }
    }
  ]
}
```

Replace `<ACCOUNT_ID>` with the AWS account ID and `<your-org>` with your Pulumi org.

Then create the role and attach permissions:

```bash
aws iam create-role \
  --role-name pulumi-user-mgmt-deploy \
  --assume-role-policy-document file://trust-policy.json

aws iam attach-role-policy \
  --role-name pulumi-user-mgmt-deploy \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess
```

Repeat for each AWS account, switching your AWS CLI profile/credentials accordingly.

> **Note:** `IAMFullAccess` is broad. For production, scope this down to only the IAM actions needed (CreateUser, DeleteUser, CreateGroup, etc.).

## Step 3: Create Per-Account ESC Environments

Create one ESC environment per AWS account listed in `users.yaml`. The value key (e.g., `aws-dev`) must match the pattern `aws-{account-name}` where `{account-name}` is the `name` from `users.yaml`.

### Dev account (`dev` in users.yaml)

```bash
pulumi env init <your-org>/user-mgmt/aws-dev
pulumi env edit <your-org>/user-mgmt/aws-dev
```

Paste the following (replace `<DEV_ACCOUNT_ID>`):

```yaml
values:
  aws-dev:
    login:
      fn::open::aws-login:
        oidc:
          roleArn: arn:aws:iam::<DEV_ACCOUNT_ID>:role/pulumi-user-mgmt-deploy
          sessionName: pulumi-user-mgmt
          duration: 1h
    region: us-east-1
```

### Prod account (`prod` in users.yaml)

```bash
pulumi env init <your-org>/user-mgmt/aws-prod
pulumi env edit <your-org>/user-mgmt/aws-prod
```

```yaml
values:
  aws-prod:
    login:
      fn::open::aws-login:
        oidc:
          roleArn: arn:aws:iam::<PROD_ACCOUNT_ID>:role/pulumi-user-mgmt-deploy
          sessionName: pulumi-user-mgmt
          duration: 1h
    region: us-west-2
```

### GitHub token

```bash
pulumi env init <your-org>/user-mgmt/github
pulumi env edit <your-org>/user-mgmt/github
```

```yaml
values:
  github:
    token:
      fn::secret: <your-github-token>
```

## Step 4: Create Composed `live` Environment

This environment imports all account environments and exposes credentials as per-account environment variables. `index.ts` uses `envVarMappings` on each `aws.Provider` to remap these to the standard AWS env vars.

```bash
pulumi env init <your-org>/user-mgmt/live
pulumi env edit <your-org>/user-mgmt/live
```

```yaml
imports:
  - user-mgmt/aws-dev
  - user-mgmt/aws-prod
  - user-mgmt/github

values:
  pulumiConfig:
    devops-user-management:aws-dev-region: ${aws-dev.region}
    devops-user-management:aws-prod-region: ${aws-prod.region}
  environmentVariables:
    GITHUB_TOKEN: ${github.token}
    DEV_AWS_ACCESS_KEY_ID: ${aws-dev.login.accessKeyId}
    DEV_AWS_SECRET_ACCESS_KEY: ${aws-dev.login.secretAccessKey}
    DEV_AWS_SESSION_TOKEN: ${aws-dev.login.sessionToken}
    PROD_AWS_ACCESS_KEY_ID: ${aws-prod.login.accessKeyId}
    PROD_AWS_SECRET_ACCESS_KEY: ${aws-prod.login.secretAccessKey}
    PROD_AWS_SESSION_TOKEN: ${aws-prod.login.sessionToken}
```

The naming convention for env vars is `{ACCOUNT_NAME}_AWS_ACCESS_KEY_ID` etc., where the account name is uppercased with hyphens replaced by underscores. `index.ts` derives this automatically from the account name in `users.yaml`.

### ESC Environment Summary

| ESC Environment              | Purpose                                     |
| ---------------------------- | ------------------------------------------- |
| `user-mgmt/aws-dev`         | OIDC login for dev AWS account              |
| `user-mgmt/aws-prod`        | OIDC login for prod AWS account             |
| `user-mgmt/github`          | GitHub token (stored as ESC secret)         |
| `user-mgmt/live`            | Composed env for live stack (imports above) |

## Step 5: Validate

```bash
pulumi env open <your-org>/user-mgmt/live
```

You should see resolved `environmentVariables` with `DEV_AWS_ACCESS_KEY_ID`, `PROD_AWS_ACCESS_KEY_ID`, etc. If you see errors, check:

- The OIDC provider exists in the target AWS account
- The trust policy audience matches `aws:<your-org>`
- The role ARN is correct in each per-account ESC environment

## Step 6: Stack Configuration

The `Pulumi.live.yaml` references the composed ESC environment. No secrets are stored in this file — all credentials are resolved dynamically by ESC via OIDC:

```yaml
environment:
  - user-mgmt/live
config:
  devops-user-management:usersFile: users.yaml
  github:owner: <your-github-org>
```

The `github:owner` config tells the GitHub provider which organization to manage. The `GITHUB_TOKEN` environment variable is injected by ESC, so no token secret is needed in the stack config.

## How It Works

```
pulumi up --stack live
    │
    ├── ESC resolves user-mgmt/live environment
    │   ├── Imports user-mgmt/aws-dev  → OIDC → STS → short-lived creds
    │   ├── Imports user-mgmt/aws-prod → OIDC → STS → short-lived creds
    │   └── Imports user-mgmt/github   → GitHub token
    │
    ├── Environment variables set:
    │   DEV_AWS_ACCESS_KEY_ID, DEV_AWS_SECRET_ACCESS_KEY, DEV_AWS_SESSION_TOKEN
    │   PROD_AWS_ACCESS_KEY_ID, PROD_AWS_SECRET_ACCESS_KEY, PROD_AWS_SESSION_TOKEN
    │   GITHUB_TOKEN
    │
    ├── pulumiConfig values injected (region per account)
    │
    └── index.ts creates providers with envVarMappings:
        aws.Provider("dev") → maps DEV_AWS_* → AWS_*
        aws.Provider("prod") → maps PROD_AWS_* → AWS_*
```

## Adding a New AWS Account

1. Create the OIDC provider and IAM role in the new account (Steps 1-2)
2. Create a new ESC environment: `pulumi env init <your-org>/user-mgmt/aws-<name>`
3. Add the import to `user-mgmt/live`
4. Add `pulumiConfig` entry for the region
5. Add `environmentVariables` entries for `{NAME}_AWS_ACCESS_KEY_ID`, `{NAME}_AWS_SECRET_ACCESS_KEY`, `{NAME}_AWS_SESSION_TOKEN`
6. Add the account to `users.yaml` under `aws_accounts`
7. Run `pulumi up`
