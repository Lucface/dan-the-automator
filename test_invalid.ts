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

// Actual pattern from the code - creates valid Slack blocks
const msg1: SlackMessage = {
  text: "test",
  blocks: [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "New Issue Detected",
        emoji: true,
      },
    },
  ],
};

// This should compile fine despite being invalid for Slack Block Kit
const msg2: SlackMessage = {
  text: "test",
  blocks: [
    {
      type: "completely_invalid_slack_block_type",
      text: {
        type: "not_a_real_text_type",
        text: "Hello",
      },
    },
  ],
};

export {};
