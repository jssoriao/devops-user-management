import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

export interface GitHubTeamComponentArgs {
  teamSlug: string;
  description?: string;
  privacy?: "closed" | "secret";
  parentTeamId?: string;
  parentTeamReadId?: string;
  parentTeamReadSlug?: string;
  notificationSetting?: string;
  ldapDn?: string;
  createDefaultMaintainer?: boolean;
}

export class GitHubTeamComponent extends pulumi.ComponentResource {
  public readonly team: github.Team;

  constructor(
    name: string,
    args: GitHubTeamComponentArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("devops-user-management:GitHubTeamComponent", name, {}, opts);

    this.team = new github.Team(
      args.teamSlug,
      {
        name: args.teamSlug,
        description: args.description,
        ...(args.privacy !== undefined && { privacy: args.privacy }),
        ...(args.parentTeamId !== undefined && {
          parentTeamId: args.parentTeamId,
        }),
        ...(args.parentTeamReadId !== undefined && {
          parentTeamReadId: args.parentTeamReadId,
        }),
        ...(args.parentTeamReadSlug !== undefined && {
          parentTeamReadSlug: args.parentTeamReadSlug,
        }),
        ...(args.notificationSetting !== undefined && {
          notificationSetting: args.notificationSetting,
        }),
        ...(args.ldapDn !== undefined && { ldapDn: args.ldapDn }),
        ...(args.createDefaultMaintainer !== undefined && {
          createDefaultMaintainer: args.createDefaultMaintainer,
        }),
      },
      { parent: this },
    );

    this.registerOutputs({
      team: this.team,
    });
  }
}
