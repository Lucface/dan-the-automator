import { Octokit } from "@octokit/rest";
import type { PRResult } from "../types";

function getOctokit(): Octokit {
  const token = process.env["GITHUB_TOKEN"];
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set");
  }
  return new Octokit({ auth: token });
}

function getRepoConfig(): { owner: string; repo: string } {
  const owner = process.env["GITHUB_OWNER"];
  const repo = process.env["GITHUB_REPO"];

  if (!owner || !repo) {
    throw new Error("GITHUB_OWNER and GITHUB_REPO must be set");
  }

  return { owner, repo };
}

/**
 * Get the default branch's latest commit SHA.
 */
async function getDefaultBranchSha(octokit: Octokit, owner: string, repo: string): Promise<string> {
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });

  return ref.object.sha;
}

/**
 * Create a fix branch from the default branch.
 */
export async function createFixBranch(issueId: string): Promise<string> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoConfig();

  const branchName = `fix/dan-${issueId}`;
  const sha = await getDefaultBranchSha(octokit, owner, repo);

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha,
  });

  console.log(`[GitHub] Created branch: ${branchName}`);
  return branchName;
}

/**
 * Commit a fix to the specified branch.
 * Gets the current file content, creates a new blob, updates the tree, and commits.
 */
export async function commitFix(
  branch: string,
  filePath: string,
  oldCode: string,
  newCode: string,
  commitMessage: string
): Promise<string> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoConfig();

  // Get the current file content
  const { data: fileData } = await octokit.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: branch,
  });

  if (Array.isArray(fileData) || fileData.type !== "file" || !("content" in fileData)) {
    throw new Error(`Expected a file at ${filePath}, got ${Array.isArray(fileData) ? "directory" : fileData.type}`);
  }

  // Decode current content and apply the fix
  const currentContent = Buffer.from(fileData.content, "base64").toString("utf-8");
  const updatedContent = currentContent.replace(oldCode, newCode);

  if (currentContent === updatedContent) {
    throw new Error(`Old code not found in ${filePath} - cannot apply fix`);
  }

  // Update the file
  const { data: commit } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(updatedContent).toString("base64"),
    sha: fileData.sha,
    branch,
  });

  const commitSha = commit.commit?.sha ?? "unknown";
  console.log(`[GitHub] Committed fix to ${branch}: ${commitSha}`);
  return commitSha;
}

/**
 * Open a pull request for the fix branch.
 */
export async function openPR(
  branch: string,
  title: string,
  body: string
): Promise<PRResult> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoConfig();

  // Get default branch for base
  const { data: repoData } = await octokit.repos.get({ owner, repo });

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branch,
    base: repoData.default_branch,
  });

  console.log(`[GitHub] PR #${pr.number} created: ${pr.html_url}`);

  return {
    url: pr.html_url,
    number: pr.number,
    branch,
  };
}
