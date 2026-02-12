interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text: string;
  }>;
}

interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

async function sendSlackMessage(message: SlackMessage): Promise<boolean> {
  const webhookUrl = process.env["SLACK_WEBHOOK_URL"];
  if (!webhookUrl) {
    console.warn("[Slack] SLACK_WEBHOOK_URL not set - skipping notification");
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Slack] Failed to send message: ${response.status} ${text}`);
      return false;
    }

    console.log("[Slack] Notification sent");
    return true;
  } catch (err: unknown) {
    const message_text = err instanceof Error ? err.message : String(err);
    console.error(`[Slack] Error sending notification: ${message_text}`);
    return false;
  }
}

/**
 * Notify that a new issue was detected.
 */
export async function notifyIssueDetected(issue: {
  issueId: string;
  title: string;
}): Promise<boolean> {
  return sendSlackMessage({
    text: `New issue detected: ${issue.title}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "New Issue Detected",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${issue.title}*\nIssue ID: \`${issue.issueId}\``,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Dan the Automator is on it.",
          },
        ],
      },
    ],
  });
}

/**
 * Notify that a fix is being worked on.
 */
export async function notifyFixInProgress(issue: {
  issueId: string;
  title: string;
}): Promise<boolean> {
  return sendSlackMessage({
    text: `Working on fix for: ${issue.title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Working on fix for *${issue.title}*\nIssue ID: \`${issue.issueId}\``,
        },
      },
    ],
  });
}

/**
 * Notify that a PR has been created with the fix.
 */
export async function notifyPRCreated(
  issue: { issueId: string; title: string },
  prUrl: string
): Promise<boolean> {
  return sendSlackMessage({
    text: `Fix ready for review: ${prUrl}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Fix Ready for Review",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${issue.title}*\n<${prUrl}|View Pull Request>`,
        },
      },
    ],
  });
}

/**
 * Notify that a fix has been deployed.
 */
export async function notifyDeployed(issue: {
  issueId: string;
  title: string;
}): Promise<boolean> {
  return sendSlackMessage({
    text: `Fix deployed for: ${issue.title}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Fix Deployed!",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${issue.title}*\nIssue ID: \`${issue.issueId}\`\n\nThe fix is now live. Please verify it works as expected.`,
        },
      },
    ],
  });
}
