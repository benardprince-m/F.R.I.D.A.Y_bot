import { describe, expect, it } from "vitest";
import { deployReply, planDeploy } from "./deploy.js";

describe("planDeploy", () => {
  it("refuses when the repo or token is missing", () => {
    expect(planDeploy({}).ok).toBe(false);
    expect(planDeploy({ FRIDAY_DEPLOY_REPO: "owner/repo" }).ok).toBe(false);
    expect(planDeploy({ FRIDAY_DEPLOY_TOKEN: "t" }).ok).toBe(false);
  });

  it("builds the GitHub dispatch request with defaults", () => {
    const plan = planDeploy({ FRIDAY_DEPLOY_REPO: "owner/repo", FRIDAY_DEPLOY_TOKEN: "t" });
    expect(plan).toEqual({
      ok: true,
      target: { repo: "owner/repo", workflow: "friday-deploy.yml", ref: "main" },
      url: "https://api.github.com/repos/owner/repo/actions/workflows/friday-deploy.yml/dispatches",
      body: { ref: "main" },
    });
  });

  it("honours overrides for workflow and ref", () => {
    const plan = planDeploy({
      FRIDAY_DEPLOY_REPO: "owner/repo",
      FRIDAY_DEPLOY_TOKEN: "t",
      FRIDAY_DEPLOY_WORKFLOW: "release.yml",
      FRIDAY_DEPLOY_REF: "release/1.x",
    });
    expect(plan.ok && plan.target.workflow).toBe("release.yml");
    expect(plan.ok && plan.body).toEqual({ ref: "release/1.x" });
  });

  it("rejects a malformed repo rather than issuing a half-formed request", () => {
    const plan = planDeploy({ FRIDAY_DEPLOY_REPO: "not-a-repo", FRIDAY_DEPLOY_TOKEN: "t" });
    expect(plan.ok).toBe(false);
    expect(plan.ok || plan.reason).toMatch(/owner\/repo/);
  });

  it("rejects a malformed ref", () => {
    const plan = planDeploy({
      FRIDAY_DEPLOY_REPO: "owner/repo",
      FRIDAY_DEPLOY_TOKEN: "t",
      FRIDAY_DEPLOY_REF: "bad ref!",
    });
    expect(plan.ok).toBe(false);
  });
});

describe("deployReply", () => {
  it("never echoes a token and names the target on success", () => {
    const text = deployReply({ ok: true, detail: "owner/repo (friday-deploy.yml)" });
    expect(text).toContain("owner/repo");
    expect(text).toMatch(/triggered/i);
  });

  it("reports the failure detail", () => {
    expect(deployReply({ ok: false, detail: "GitHub returned 403." })).toContain("403");
  });
});
