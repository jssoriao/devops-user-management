import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

export interface GitHubTeamComponentArgs {
  teamSlug: string;
  description?: string;
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
      },
      { parent: this },
    );

    this.registerOutputs({
      team: this.team,
    });
  }
}
