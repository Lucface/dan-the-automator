import Anthropic from "@anthropic-ai/sdk";
import type { AgentFixResult } from "../types";

const SYSTEM_PROMPT = `You are a precise code fixer. Given an error analysis from Sentry's Seer AI, you suggest the minimal fix needed.

RULES:
- Only fix the specific bug described
- Make the smallest possible change
- Don't refactor surrounding code
- Don't add new features
- Preserve existing code style
- If you can't determine the fix, say so clearly

OUTPUT FORMAT (strict JSON):
{
  "file": "path/to/file.ts",
  "oldCode": "the exact code that needs to change",
  "newCode": "the replacement code",
  "explanation": "brief explanation of what was wrong and what the fix does"
}

Only output the JSON object. No markdown, no code blocks, no extra text.`;

function buildUserPrompt(params: {
  title: string;
  seerAnalysis: string | undefined;
  file: string | undefined;
  line: number | undefined;
}): string {
  const parts = [`## Error: ${params.title}`];

  if (params.seerAnalysis) {
    parts.push(`\n## Seer Analysis:\n${params.seerAnalysis}`);
  }

  if (params.file) {
    parts.push(`\n## File: ${params.file}`);
  }

  if (params.line !== undefined) {
    parts.push(`## Line: ${params.line}`);
  }

  parts.push("\nPlease analyze this error and suggest the minimal fix.");

  return parts.join("\n");
}

const AgentFixResultSchema = {
  parse(raw: string): AgentFixResult {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("file" in parsed) ||
      !("oldCode" in parsed) ||
      !("newCode" in parsed) ||
      !("explanation" in parsed)
    ) {
      throw new Error("Invalid agent response shape - missing required fields");
    }

    const obj = parsed as Record<string, unknown>;

    if (
      typeof obj["file"] !== "string" ||
      typeof obj["oldCode"] !== "string" ||
      typeof obj["newCode"] !== "string" ||
      typeof obj["explanation"] !== "string"
    ) {
      throw new Error("Invalid agent response shape - fields must be strings");
    }

    return {
      file: obj["file"],
      oldCode: obj["oldCode"],
      newCode: obj["newCode"],
      explanation: obj["explanation"],
    };
  },
};

/**
 * Analyze an issue and suggest a fix using Claude.
 */
export async function analyzeAndFix(params: {
  title: string;
  seerAnalysis: string | undefined;
  file: string | undefined;
  line: number | undefined;
}): Promise<AgentFixResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });

  const userPrompt = buildUserPrompt(params);

  console.log("[Agent] Sending issue to Claude for analysis...");
  console.log(`[Agent] Title: "${params.title}"`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract text content from the response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  const rawText = textBlock.text.trim();
  console.log("[Agent] Received response from Claude");

  // Parse the JSON response
  const result = AgentFixResultSchema.parse(rawText);

  console.log(`[Agent] Fix suggested for file: ${result.file}`);
  console.log(`[Agent] Explanation: ${result.explanation}`);

  return result;
}
