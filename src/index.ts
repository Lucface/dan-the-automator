import { Hono } from "hono";
import { sentryWebhook } from "./webhooks/sentry";
import { fixQueue } from "./queue/fix-queue";

const app = new Hono();

// ── Health Check ────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "dan-the-automator",
    version: "0.1.0",
    uptime: process.uptime(),
    queue: fixQueue.stats(),
  });
});

// ── Webhook Routes ──────────────────────────────────────────────────

app.route("/webhook", sentryWebhook);

// Mount manual trigger at root level too
app.post("/trigger", async (c) => {
  // Forward to the webhook handler
  const url = new URL(c.req.url);
  url.pathname = "/webhook/trigger";
  const newReq = new Request(url.toString(), {
    method: "POST",
    headers: c.req.raw.headers,
    body: await c.req.text(),
  });
  return app.fetch(newReq);
});

// ── Job Status ──────────────────────────────────────────────────────

app.get("/jobs", (c) => {
  const status = c.req.query("status");
  const jobs = status
    ? fixQueue.getAllJobs(status as Parameters<typeof fixQueue.getAllJobs>[0])
    : fixQueue.getAllJobs();
  return c.json({ jobs });
});

app.get("/jobs/:id", (c) => {
  const job = fixQueue.getJob(c.req.param("id"));
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  return c.json({ job });
});

// ── Start Server ────────────────────────────────────────────────────

const port = Number(process.env["PORT"]) || 3456;

console.log(`[Dan] Starting server on port ${port}`);
console.log(`[Dan] Health check: http://localhost:${port}/health`);
console.log(`[Dan] Sentry webhook: POST http://localhost:${port}/webhook/sentry`);
console.log(`[Dan] Manual trigger: POST http://localhost:${port}/trigger`);

export default {
  port,
  fetch: app.fetch,
};
