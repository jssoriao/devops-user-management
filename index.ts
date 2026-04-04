import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { GitHubTeamComponent } from "./src/components/github-team";
import { UserComponent } from "./src/components/user";
import { loadConfig, validateConfig } from "./src/config";
import { resourceName } from "./src/naming";

const config = new pulumi.Config();
const usersFile = config.get("usersFile") ?? "users.yaml";

const usersConfig = loadConfig(usersFile);
validateConfig(usersConfig);

const stackName = pulumi.getStack();
const DEFAULT_POLICY_ARN = "arn:aws:iam::aws:policy/ReadOnlyAccess";

// 1. Create one AWS provider per account using envVarMappings (credentials injected by ESC)
const accountProviders: Record<string, aws.Provider> = {};
for (const acct of usersConfig.aws_accounts) {
  const region = config.require(`aws-${acct.name}-region`) as aws.Region;
  const prefix = acct.name.toUpperCase().replace(/-/g, "_");
  accountProviders[acct.name] = new aws.Provider(
    resourceName(stackName, acct.name, "provider"),
    { region },
    {
      envVarMappings: {
        [`${prefix}_AWS_ACCESS_KEY_ID`]: "AWS_ACCESS_KEY_ID",
        [`${prefix}_AWS_SECRET_ACCESS_KEY`]: "AWS_SECRET_ACCESS_KEY",
        [`${prefix}_AWS_SESSION_TOKEN`]: "AWS_SESSION_TOKEN",
      },
    },
  );
}

// 2. Create GitHub teams from github_teams section
const teams: Record<string, GitHubTeamComponent> = {};
for (const teamDef of usersConfig.github_teams) {
  teams[teamDef.name] = new GitHubTeamComponent(
    resourceName(stackName, teamDef.name),
    {
      teamSlug: teamDef.name,
      description: teamDef.description,
      privacy: teamDef.privacy,
      parentTeamId: teamDef.parent_team_id?.toString(),
      parentTeamReadId: teamDef.parent_team_read_id?.toString(),
      parentTeamReadSlug: teamDef.parent_team_read_slug,
      notificationSetting: teamDef.notification_setting,
      ldapDn: teamDef.ldap_dn,
      createDefaultMaintainer: teamDef.create_default_maintainer,
    },
  );
}

// 3. Create IAM groups scoped to accounts with policy attachments
const groups: Record<string, aws.iam.Group> = {};
for (const groupDef of usersConfig.iam_groups) {
  const provider = accountProviders[groupDef.account];
  const groupResName = resourceName(stackName, groupDef.account, groupDef.name);
  const g = new aws.iam.Group(
    groupResName,
    {
      name: resourceName(stackName, groupDef.name),
      path: groupDef.path,
    },
    { provider },
  );

  const policyArns: string[] =
    groupDef.policy_arns ??
    (groupDef.policy_arn ? [groupDef.policy_arn] : [DEFAULT_POLICY_ARN]);

  for (let i = 0; i < policyArns.length; i++) {
    new aws.iam.GroupPolicyAttachment(
      resourceName(stackName, groupDef.account, groupDef.name, `policy-${i}`),
      { group: g.name, policyArn: policyArns[i] },
      { provider },
    );
  }

  groups[`${groupDef.account}/${groupDef.name}`] = g;
}

// 4. Create per-user resources using UserComponent
for (const user of usersConfig.users) {
  new UserComponent(
    resourceName(stackName, user.name),
    {
      username: user.name,
      github: {
        teamSlug: user.github.team,
        orgRole: user.github.role,
        teamRole: user.github.team_role,
      },
      iamAssignments: user.iam_assignments.map((a) => ({
        account: a.account,
        groupName: resourceName(stackName, a.iam_group),
        provider: accountProviders[a.account],
      })),
    },
    {
      dependsOn: [
        teams[user.github.team],
        ...user.iam_assignments.map(
          (a) => groups[`${a.account}/${a.iam_group}`],
        ),
      ],
    },
  );
}
