import * as pulumi from "@pulumi/pulumi";

import { GitHubMembershipComponent } from "./src/components/github-membership";
import { GitHubTeamComponent } from "./src/components/github-team";
import { loadConfig, validateConfig } from "./src/config";
import { resourceName } from "./src/naming";

const config = new pulumi.Config();
const usersFile = config.get("usersFile") ?? "users.yaml";

const usersConfig = loadConfig(usersFile);
validateConfig(usersConfig);

const stackName = pulumi.getStack();

// Create GitHub teams from github_teams section (with full property support)
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

// Create per-user GitHub memberships
for (const user of usersConfig.users) {
  new GitHubMembershipComponent(
    resourceName(stackName, user.name, "github"),
    {
      username: user.name,
      teamSlug: user.github.team,
      orgRole: user.github.role,
      teamRole: user.github.team_role,
    },
    { dependsOn: [teams[user.github.team]] },
  );
}

// TODO (task 9): Multi-account AWS provider creation and IAM resource orchestration
