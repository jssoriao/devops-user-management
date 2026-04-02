# Manual Integration Testing

Since there's no sandbox environment, all deploys go to live. Use these disposable resources to validate IaC changes against real APIs without affecting actual users.

## AWS: Test IAM Group

1. Create a test IAM group (e.g., `test-integration`) and a test IAM user (e.g., `test-bot`)
2. Add a test entry to `users.yaml`:
   ```yaml
   users:
     - name: test-bot
       github_team: test-team
       iam_group: test-integration
   ```
3. Run `pulumi up` on your dev stack — this applies policies and group membership to the test group only
4. Verify the group, user, and policy attachment in the AWS console
5. Remove the test entry and run `pulumi up` again to clean up

## GitHub: Test Team

1. Create a test GitHub team (e.g., `test-team`) or let Pulumi create it via the config above
2. Use a bot account or a secondary account as the test user
3. Verify org membership and team assignment in GitHub settings
4. Clean up by removing the entry from `users.yaml` and running `pulumi up`

## When to Run

- Before merging changes to component resources (team, membership, AWS user)
- After modifying policy attachment logic or naming conventions
- When upgrading Pulumi provider versions
