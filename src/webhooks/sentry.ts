import { Hono } from "hono";
import { SentryWebhookPayloadSchema, ManualTriggerSchema } from "../types";
import { fixQueue } from "../queue/fix-queue";
import { notifyIssueDetected } from "../notify/slack";

export const sentryWebhook = new Hono();

/**
 * Verify Sentry webhook signature (HMAC-SHA256).
 * Sentry sends the signature in the `sentry-hook-signature` header.
 */
async function verifySentrySignature(body: string, signature: string | undefined): Promise<boolean> {
  const secret = process.env["SENTRY_WEBHOOK_SECRET"];
  if (!secret) {
    console.warn("[Webhook] SENTRY_WEBHOOK_SECRET not set - skipping signature verification");
    return true;
  }

  if (!signature) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature === expected;
}

/**
 * POST /webhook/sentry
 * Receives Sentry issue webhooks, verifies signature, enqueues fix job.
 */
sentryWebhook.post("/sentry", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("sentry-hook-signature");

  // Verify signature
  const isValid = await verifySentrySignature(rawBody, signature);
  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Parse and validate payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = SentryWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const { action, data } = parsed.data;
  const issue = data.issue;

  // Only process new issues
  if (action !== "created" && action !== "triggered") {
    return c.json({ status: "ignored", reason: `Action '${action}' not processed` });
  }

  // Extract file info from metadata if available
  const file = issue.metadata?.filename;

  // Notify Slack
  await notifyIssueDetected({ issueId: issue.id, title: issue.title });

  // Enqueue fix job
  const job = fixQueue.enqueue({
    issueId: issue.id,
    title: issue.title,
    seerAnalysis: issue.metadata?.value,
    file,
  });

  return c.json({
    status: "queued",
    jobId: job.id,
    issueId: issue.id,
  });
});

/**
 * POST /trigger
 * Manual trigger for testing - accepts issue details directly.
 */
sentryWebhook.post("/trigger", async (c) => {
  const body = await c.req.json();
  const parsed = ManualTriggerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const { issueId, title, seerAnalysis, file, line } = parsed.data;

  // Notify Slack
  await notifyIssueDetected({ issueId, title });

  // Enqueue fix job
  const job = fixQueue.enqueue({
    issueId,
    title,
    seerAnalysis,
    file,
    line,
  });

  return c.json({
    status: "queued",
    jobId: job.id,
    issueId,
  });
});
