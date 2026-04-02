import { describe, it, expect, beforeAll } from "vitest";
import * as pulumi from "@pulumi/pulumi";
import * as fc from "fast-check";

import { validName } from "./arbitraries";

// Track created resources for assertions
const createdResources: Array<{
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}> = [];

// Set up Pulumi mocks before any tests run
beforeAll(() => {
  pulumi.runtime.setMocks(
    {
      newResource(args) {
        createdResources.push({
          type: args.type,
          name: args.name,
          inputs: args.inputs as Record<string, unknown>,
        });
        return { id: `${args.name}-id`, state: args.inputs };
      },
      call(args) {
        return args.inputs;
      },
    },
    "test",
    "dev",
    false,
  );
});

// Feature: devops-user-management, Property 6: Default membership role
// Validates: Requirements 3.3

describe("GitHubMembershipComponent", () => {
  it("defaults membership role to 'member' when no role is specified (property)", async () => {
    const { GitHubMembershipComponent } = await import(
      "../src/components/github-membership"
    );

    await fc.assert(
      fc.asyncProperty(validName, validName, async (username, teamSlug) => {
        const startIdx = createdResources.length;

        const comp = new GitHubMembershipComponent(`${username}-github`, {
          username,
          teamSlug,
        });

        // Await outputs to ensure child resources are registered
        await new Promise<void>((resolve) =>
          pulumi.all([comp.membership.urn, comp.teamMembership.urn]).apply(
            () => resolve(),
          ),
        );

        const newResources = createdResources.slice(startIdx);

        const membership = newResources.find(
          (r) => r.type === "github:index/membership:Membership",
        );
        const teamMembership = newResources.find(
          (r) => r.type === "github:index/teamMembership:TeamMembership",
        );

        expect(membership).toBeDefined();
        expect(membership!.inputs.role).toBe("member");

        expect(teamMembership).toBeDefined();
        expect(teamMembership!.inputs.role).toBe("member");
      }),
      { numRuns: 100 },
    );
  });

  it("uses the provided role when explicitly specified", async () => {
    const { GitHubMembershipComponent } = await import(
      "../src/components/github-membership"
    );

    const startIdx = createdResources.length;

    const comp = new GitHubMembershipComponent("test-admin-github", {
      username: "admin",
      teamSlug: "platform",
      role: "maintainer",
    });

    await new Promise<void>((resolve) =>
      pulumi.all([comp.membership.urn, comp.teamMembership.urn]).apply(() =>
        resolve(),
      ),
    );

    const newResources = createdResources.slice(startIdx);

    const membership = newResources.find(
      (r) => r.type === "github:index/membership:Membership",
    );
    const teamMembership = newResources.find(
      (r) => r.type === "github:index/teamMembership:TeamMembership",
    );

    expect(membership).toBeDefined();
    expect(membership!.inputs.role).toBe("maintainer");

    expect(teamMembership).toBeDefined();
    expect(teamMembership!.inputs.role).toBe("maintainer");
  });
});
