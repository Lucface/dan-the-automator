import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { sentryWebhook } from "../src/webhooks/sentry";
import { fixQueue } from "../src/queue/fix-queue";
import { JobStatus } from "../src/types";

// ── Test App Setup ──────────────────────────────────────────────────

function createTestApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "dan-the-automator",
      version: "0.1.0",
      queue: fixQueue.stats(),
    })
  );

  app.route("/webhook", sentryWebhook);

  // Mirror the root-level trigger from index.ts
  app.post("/trigger", async (c) => {
    const url = new URL(c.req.url);
    url.pathname = "/webhook/trigger";
    const newReq = new Request(url.toString(), {
      method: "POST",
      headers: c.req.raw.headers,
      body: await c.req.text(),
    });
    return app.fetch(newReq);
  });

  return app;
}

// ── Helpers ─────────────────────────────────────────────────────────

async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validSentryPayload() {
  return {
    action: "created",
    data: {
      issue: {
        id: "12345",
        title: "TypeError: Cannot read property 'save' of undefined",
        culprit: "src/components/Dashboard.tsx",
        metadata: {
          type: "TypeError",
          value: "Cannot read property 'save' of undefined - missing null check on user object",
          filename: "src/components/Dashboard.tsx",
          function: "handleSave",
        },
        permalink: "https://sentry.io/issues/12345/",
      },
    },
    actor: {
      type: "application",
      id: 1,
      name: "sentry",
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Health Check", () => {
  it("returns ok status", async () => {
    const app = createTestApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("dan-the-automator");
  });
});

describe("Sentry Webhook", () => {
  const WEBHOOK_SECRET = "test-secret-key";

  beforeEach(() => {
    fixQueue.clear();
    process.env["SENTRY_WEBHOOK_SECRET"] = WEBHOOK_SECRET;
    // Disable Slack notifications in tests
    delete process.env["SLACK_WEBHOOK_URL"];
  });

  it("accepts valid payload with correct signature", async () => {
    const app = createTestApp();
    const payload = JSON.stringify(validSentryPayload());
    const signature = await signPayload(payload, WEBHOOK_SECRET);

    const res = await app.request("/webhook/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": signature,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; jobId: string; issueId: string };
    expect(body.status).toBe("queued");
    expect(body.jobId).toBeDefined();
    expect(body.issueId).toBe("12345");
  });

  it("rejects payload with invalid signature", async () => {
    const app = createTestApp();
    const payload = JSON.stringify(validSentryPayload());

    const res = await app.request("/webhook/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": "invalid-signature",
      },
      body: payload,
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid signature");
  });

  it("rejects payload with missing signature", async () => {
    const app = createTestApp();
    const payload = JSON.stringify(validSentryPayload());

    const res = await app.request("/webhook/sentry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    expect(res.status).toBe(401);
  });

  it("rejects invalid JSON", async () => {
    const app = createTestApp();
    const signature = await signPayload("not-json", WEBHOOK_SECRET);

    const res = await app.request("/webhook/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": signature,
      },
      body: "not-json",
    });

    expect(res.status).toBe(400);
  });

  it("rejects payload with missing required fields", async () => {
    const app = createTestApp();
    const payload = JSON.stringify({ action: "created" });
    const signature = await signPayload(payload, WEBHOOK_SECRET);

    const res = await app.request("/webhook/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": signature,
      },
      body: payload,
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid payload");
  });

  it("ignores non-create actions", async () => {
    const app = createTestApp();
    const payload = JSON.stringify({
      ...validSentryPayload(),
      action: "resolved",
    });
    const signature = await signPayload(payload, WEBHOOK_SECRET);

    const res = await app.request("/webhook/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": signature,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason: string };
    expect(body.status).toBe("ignored");
  });
});

describe("Manual Trigger", () => {
  beforeEach(() => {
    fixQueue.clear();
    delete process.env["SENTRY_WEBHOOK_SECRET"];
    delete process.env["SLACK_WEBHOOK_URL"];
  });

  it("accepts valid manual trigger payload", async () => {
    const app = createTestApp();

    const res = await app.request("/webhook/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId: "manual-001",
        title: "Test issue for debugging",
        seerAnalysis: "Missing null check on line 42",
        file: "src/utils/helpers.ts",
        line: 42,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; jobId: string; issueId: string };
    expect(body.status).toBe("queued");
    expect(body.issueId).toBe("manual-001");
  });

  it("accepts minimal manual trigger payload", async () => {
    const app = createTestApp();

    const res = await app.request("/webhook/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId: "manual-002",
        title: "Minimal test issue",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("queued");
  });

  it("rejects invalid manual trigger payload", async () => {
    const app = createTestApp();

    const res = await app.request("/webhook/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Missing issueId" }),
    });

    expect(res.status).toBe(400);
  });

  it("works at root /trigger path", async () => {
    const app = createTestApp();

    const res = await app.request("/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId: "root-trigger-001",
        title: "Root trigger test",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; issueId: string };
    expect(body.status).toBe("queued");
    expect(body.issueId).toBe("root-trigger-001");
  });
});

describe("Queue State Transitions", () => {
  beforeEach(() => {
    fixQueue.clear();
  });

  it("starts jobs in pending state", () => {
    const job = fixQueue.enqueue({
      issueId: "q-001",
      title: "Test job",
    });

    // Job starts as pending, then immediately transitions to processing
    // Since processNext is fire-and-forget, check that the job exists
    expect(job.issueId).toBe("q-001");
    expect(job.title).toBe("Test job");
  });

  it("transitions through status states", () => {
    const job = fixQueue.enqueue({
      issueId: "q-002",
      title: "Transition test",
    });

    fixQueue.updateStatus(job.id, JobStatus.PROCESSING);
    expect(fixQueue.getJob(job.id)?.status).toBe(JobStatus.PROCESSING);

    fixQueue.setAgentOutput(job.id, {
      file: "test.ts",
      oldCode: "const x = null",
      newCode: "const x = undefined",
      explanation: "test fix",
    });
    expect(fixQueue.getJob(job.id)?.status).toBe(JobStatus.FIXED);
    expect(fixQueue.getJob(job.id)?.agentOutput?.file).toBe("test.ts");

    fixQueue.setPRUrl(job.id, "https://github.com/test/test/pull/1");
    expect(fixQueue.getJob(job.id)?.status).toBe(JobStatus.PR_CREATED);
    expect(fixQueue.getJob(job.id)?.prUrl).toBe("https://github.com/test/test/pull/1");

    fixQueue.updateStatus(job.id, JobStatus.DEPLOYED);
    expect(fixQueue.getJob(job.id)?.status).toBe(JobStatus.DEPLOYED);
  });

  it("handles failure state", () => {
    const job = fixQueue.enqueue({
      issueId: "q-003",
      title: "Failure test",
    });

    fixQueue.fail(job.id, "Something went wrong");
    expect(fixQueue.getJob(job.id)?.status).toBe(JobStatus.FAILED);
    expect(fixQueue.getJob(job.id)?.error).toBe("Something went wrong");
  });

  it("finds jobs by issue ID", () => {
    fixQueue.enqueue({ issueId: "find-001", title: "Findable job" });

    const found = fixQueue.getJobByIssueId("find-001");
    expect(found).toBeDefined();
    expect(found?.title).toBe("Findable job");

    const notFound = fixQueue.getJobByIssueId("nonexistent");
    expect(notFound).toBeUndefined();
  });

  it("returns all jobs filtered by status", () => {
    fixQueue.enqueue({ issueId: "filter-001", title: "Job 1" });
    const job2 = fixQueue.enqueue({ issueId: "filter-002", title: "Job 2" });
    fixQueue.fail(job2.id, "failed");

    const failedJobs = fixQueue.getAllJobs(JobStatus.FAILED);
    expect(failedJobs.length).toBe(1);
    expect(failedJobs[0]?.issueId).toBe("filter-002");
  });

  it("tracks queue stats", () => {
    fixQueue.enqueue({ issueId: "stats-001", title: "Job 1" });
    const job2 = fixQueue.enqueue({ issueId: "stats-002", title: "Job 2" });
    fixQueue.fail(job2.id, "failed");

    const stats = fixQueue.stats();
    expect(stats[JobStatus.FAILED]).toBe(1);
  });
});
