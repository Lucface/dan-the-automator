import { z } from "zod";

// ── Sentry Webhook Payload ──────────────────────────────────────────

export const SentryIssueDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  culprit: z.string().optional(),
  metadata: z
    .object({
      type: z.string().optional(),
      value: z.string().optional(),
      filename: z.string().optional(),
      function: z.string().optional(),
    })
    .optional(),
  permalink: z.string().url().optional(),
});

export const SentryWebhookPayloadSchema = z.object({
  action: z.string(),
  data: z.object({
    issue: SentryIssueDataSchema,
  }),
  actor: z
    .object({
      type: z.string(),
      id: z.number().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

export type SentryIssueData = z.infer<typeof SentryIssueDataSchema>;
export type SentryWebhookPayload = z.infer<typeof SentryWebhookPayloadSchema>;

// ── Manual Trigger Payload ──────────────────────────────────────────

export const ManualTriggerSchema = z.object({
  issueId: z.string(),
  title: z.string(),
  seerAnalysis: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
});

export type ManualTriggerPayload = z.infer<typeof ManualTriggerSchema>;

// ── Fix Job ─────────────────────────────────────────────────────────

export const JobStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  FIXED: "fixed",
  PR_CREATED: "pr_created",
  DEPLOYED: "deployed",
  FEEDBACK: "feedback",
  FAILED: "failed",
} as const;

export type JobStatusType = (typeof JobStatus)[keyof typeof JobStatus];

export interface FixJob {
  id: string;
  issueId: string;
  title: string;
  seerAnalysis: string | undefined;
  file: string | undefined;
  line: number | undefined;
  status: JobStatusType;
  createdAt: Date;
  updatedAt: Date;
  agentOutput: AgentFixResult | undefined;
  prUrl: string | undefined;
  error: string | undefined;
}

// ── Agent Output ────────────────────────────────────────────────────

export interface AgentFixResult {
  file: string;
  oldCode: string;
  newCode: string;
  explanation: string;
}

// ── GitHub PR ───────────────────────────────────────────────────────

export interface PRResult {
  url: string;
  number: number;
  branch: string;
}

// ── Slack Message Types ─────────────────────────────────────────────

export type SlackNotificationType =
  | "issue_detected"
  | "fix_in_progress"
  | "pr_created"
  | "deployed";
