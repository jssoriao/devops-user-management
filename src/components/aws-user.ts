import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface AWSUserComponentArgs {
  username: string;
  groupName: string;
}

export class AWSUserComponent extends pulumi.ComponentResource {
  public readonly user: aws.iam.User;
  public readonly groupMembership: aws.iam.UserGroupMembership;

  constructor(
    name: string,
    args: AWSUserComponentArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("devops-user-management:AWSUserComponent", name, {}, opts);

    this.user = new aws.iam.User(
      `${name}-user`,
      {
        name: args.username,
      },
      { parent: this },
    );

    this.groupMembership = new aws.iam.UserGroupMembership(
      `${name}-group-membership`,
      {
        user: this.user.name,
        groups: [args.groupName],
      },
      { parent: this },
    );

    this.registerOutputs({
      user: this.user,
      groupMembership: this.groupMembership,
    });
  }
}
