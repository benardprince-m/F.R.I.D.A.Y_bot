// FRIDAY ops: the phone-only deploy trigger (Product Specification §14; G-06).
//
// The owner is phone-only, so deploy/update/restart is a chat command, not a terminal. This
// module owns the *decision*: it reads the configured target, validates it, and describes the
// GitHub Actions workflow-dispatch call. The caller (index.ts) performs the HTTP request using
// the engine's dispatcher-aware fetch.
//
// The value that authorises the call (a GitHub token with actions:write) is read from the
// environment and is NEVER returned in a reply or logged. Pure: no I/O.
//
// Contract: see docs/contracts/phone-only.md.

export interface DeployTarget {
  repo: string;
  workflow: string;
  ref: string;
}

export type DeployPlan =
  | { ok: true; target: DeployTarget; url: string; body: { ref: string } }
  | { ok: false; reason: string };

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// A workflow is dispatched by file name or numeric id: no slashes, no query/fragment, no "..".
const WORKFLOW_RE = /^[A-Za-z0-9._-]+\.ya?ml$/;
const REF_RE = /^[A-Za-z0-9._/-]+$/;

/** Reject any ref containing a ".." path segment (traversal) or a leading/trailing slash. */
function isSafeRef(ref: string): boolean {
  if (!REF_RE.test(ref)) {
    return false;
  }
  if (ref.startsWith("/") || ref.endsWith("/") || ref.includes("//")) {
    return false;
  }
  return !ref.split("/").some((segment) => segment === ".." || segment === ".");
}

const NOT_CONFIGURED =
  "Deploy is not configured. Set FRIDAY_DEPLOY_REPO (owner/repo), FRIDAY_DEPLOY_TOKEN " +
  "(a GitHub token with actions:write), and optionally FRIDAY_DEPLOY_REF on the host, then retry.";

/**
 * Resolve the deploy target from the environment.
 *
 * Required: `FRIDAY_DEPLOY_REPO` ("owner/repo") and `FRIDAY_DEPLOY_TOKEN` (non-empty).
 * Optional: `FRIDAY_DEPLOY_WORKFLOW` (default `friday-deploy.yml`), `FRIDAY_DEPLOY_REF`
 * (default `main`). A missing or malformed value returns `ok: false` with a reason — never a
 * half-formed request.
 */
export function planDeploy(env: Record<string, string | undefined>): DeployPlan {
  const repo = (env.FRIDAY_DEPLOY_REPO ?? "").trim();
  const token = (env.FRIDAY_DEPLOY_TOKEN ?? "").trim();
  if (!repo || !token) {
    return { ok: false, reason: NOT_CONFIGURED };
  }
  if (!REPO_RE.test(repo)) {
    return { ok: false, reason: 'FRIDAY_DEPLOY_REPO must look like "owner/repo".' };
  }
  const workflow = (env.FRIDAY_DEPLOY_WORKFLOW ?? "friday-deploy.yml").trim();
  const ref = (env.FRIDAY_DEPLOY_REF ?? "main").trim();
  if (!WORKFLOW_RE.test(workflow)) {
    return {
      ok: false,
      reason: "FRIDAY_DEPLOY_WORKFLOW must be a workflow file name like friday-deploy.yml.",
    };
  }
  if (!isSafeRef(ref)) {
    return { ok: false, reason: "FRIDAY_DEPLOY_REF must be a valid branch or tag name." };
  }
  return {
    ok: true,
    target: { repo, workflow, ref },
    url: `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    body: { ref },
  };
}

/** The owner-facing result. Never contains the token. */
export function deployReply(outcome: { ok: boolean; detail: string }): string {
  if (outcome.ok) {
    return (
      `Deploy triggered on ${outcome.detail}.\n` +
      "The build takes a few minutes. Watch it in the GitHub app (Actions → FRIDAY Deploy), " +
      "then restart the FRIDAY service on the host to pick up the new image."
    );
  }
  return `Deploy failed: ${outcome.detail}`;
}
