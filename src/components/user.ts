import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { GitHubMembershipComponent } from "./github-membership";
import { AWSUserComponent } from "./aws-user";

export interface IAMAssignmentArgs {
  account: string;
  groupName: string;
  provider: aws.Provider;
}

export interface UserComponentArgs {
  username: string;
  github: {
    teamSlug: string;
    orgRole?: string;
    teamRole?: string;
  };
  iamAssignments: IAMAssignmentArgs[];
}

export class UserComponent extends pulumi.ComponentResource {
  public readonly githubMembership: GitHubMembershipComponent;
  public readonly awsUsers: AWSUserComponent[];

  constructor(
    name: string,
    args: UserComponentArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("devops-user-management:UserComponent", name, {}, opts);

    this.githubMembership = new GitHubMembershipComponent(
      `${args.username}-github`,
      {
        username: args.username,
        teamSlug: args.github.teamSlug,
        orgRole: args.github.orgRole,
        teamRole: args.github.teamRole,
      },
      { parent: this },
    );

    this.awsUsers = args.iamAssignments.map(
      (assignment) =>
        new AWSUserComponent(
          `${args.username}-${assignment.account}-aws`,
          {
            username: args.username,
            groupName: assignment.groupName,
          },
          { parent: this, provider: assignment.provider },
        ),
    );

    this.registerOutputs({
      githubMembership: this.githubMembership,
      awsUsers: this.awsUsers,
    });
  }
}
