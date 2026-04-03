import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

export interface GitHubMembershipComponentArgs {
  username: string;
  teamSlug: string;
  orgRole?: string;
  teamRole?: string;
}

export class GitHubMembershipComponent extends pulumi.ComponentResource {
  public readonly membership: github.Membership;
  public readonly teamMembership: github.TeamMembership;

  constructor(
    name: string,
    args: GitHubMembershipComponentArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("devops-user-management:GitHubMembershipComponent", name, {}, opts);

    const orgRole = args.orgRole ?? "member";
    const teamRole = args.teamRole ?? "member";

    this.membership = new github.Membership(
      `${args.username}-membership`,
      {
        username: args.username,
        role: orgRole,
      },
      { parent: this },
    );

    this.teamMembership = new github.TeamMembership(
      `${args.username}-team-membership`,
      {
        teamId: args.teamSlug,
        username: args.username,
        role: teamRole,
      },
      { parent: this },
    );

    this.registerOutputs({
      membership: this.membership,
      teamMembership: this.teamMembership,
    });
  }
}
