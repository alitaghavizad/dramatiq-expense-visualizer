export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreation5mInputTokens: number;
  cacheCreation1hInputTokens: number;
  cacheReadInputTokens: number;
  webSearchRequests: number;
};

type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
  server_tool_use?: {
    web_search_requests?: number | null;
  } | null;
};

export const SONNET_5_PRICING = Object.freeze({
  model: "claude-sonnet-5",
  currency: "USD",
  effectiveDate: "2026-08-22",
  inputPerMillionTokens: 2,
  outputPerMillionTokens: 10,
  cacheCreation5mPerMillionTokens: 2.5,
  cacheCreation1hPerMillionTokens: 4,
  cacheReadPerMillionTokens: 0.2,
  webSearchPerRequest: 0.01,
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  webSearchSource: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool",
});

const NANODOLLARS_PER_DOLLAR = 1_000_000_000;
const NANODOLLARS_PER_MILLIONTH_DOLLAR = 1_000;

export function emptyChatUsage(): ChatUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreation5mInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheReadInputTokens: 0,
    webSearchRequests: 0,
  };
}

export function chatUsageFromAnthropic(usage: AnthropicUsageLike): ChatUsage {
  const detailedCacheCreation = usage.cache_creation;
  const cacheCreation5m = detailedCacheCreation
    ? detailedCacheCreation.ephemeral_5m_input_tokens ?? 0
    : usage.cache_creation_input_tokens ?? 0;
  const cacheCreation1h = detailedCacheCreation?.ephemeral_1h_input_tokens ?? 0;

  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreation5mInputTokens: cacheCreation5m,
    cacheCreation1hInputTokens: cacheCreation1h,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    webSearchRequests: usage.server_tool_use?.web_search_requests ?? 0,
  };
}

export function mergeCumulativeChatUsage(
  current: ChatUsage,
  usage: AnthropicUsageLike,
): ChatUsage {
  const next = chatUsageFromAnthropic(usage);
  return {
    inputTokens: usage.input_tokens == null ? current.inputTokens : next.inputTokens,
    outputTokens: usage.output_tokens == null ? current.outputTokens : next.outputTokens,
    cacheCreation5mInputTokens: usage.cache_creation_input_tokens == null && usage.cache_creation == null
      ? current.cacheCreation5mInputTokens
      : next.cacheCreation5mInputTokens,
    cacheCreation1hInputTokens: usage.cache_creation == null
      ? current.cacheCreation1hInputTokens
      : next.cacheCreation1hInputTokens,
    cacheReadInputTokens: usage.cache_read_input_tokens == null
      ? current.cacheReadInputTokens
      : next.cacheReadInputTokens,
    webSearchRequests: usage.server_tool_use?.web_search_requests == null
      ? current.webSearchRequests
      : next.webSearchRequests,
  };
}

export function addChatUsage(left: ChatUsage, right: ChatUsage): ChatUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheCreation5mInputTokens: left.cacheCreation5mInputTokens + right.cacheCreation5mInputTokens,
    cacheCreation1hInputTokens: left.cacheCreation1hInputTokens + right.cacheCreation1hInputTokens,
    cacheReadInputTokens: left.cacheReadInputTokens + right.cacheReadInputTokens,
    webSearchRequests: left.webSearchRequests + right.webSearchRequests,
  };
}

export function calculateEstimatedCostNanos(
  usage: ChatUsage,
  model: string,
): number {
  if (model !== SONNET_5_PRICING.model) return 0;

  return Math.round(
    usage.inputTokens * SONNET_5_PRICING.inputPerMillionTokens * NANODOLLARS_PER_MILLIONTH_DOLLAR
    + usage.outputTokens * SONNET_5_PRICING.outputPerMillionTokens * NANODOLLARS_PER_MILLIONTH_DOLLAR
    + usage.cacheCreation5mInputTokens * SONNET_5_PRICING.cacheCreation5mPerMillionTokens * NANODOLLARS_PER_MILLIONTH_DOLLAR
    + usage.cacheCreation1hInputTokens * SONNET_5_PRICING.cacheCreation1hPerMillionTokens * NANODOLLARS_PER_MILLIONTH_DOLLAR
    + usage.cacheReadInputTokens * SONNET_5_PRICING.cacheReadPerMillionTokens * NANODOLLARS_PER_MILLIONTH_DOLLAR
    + usage.webSearchRequests * SONNET_5_PRICING.webSearchPerRequest * NANODOLLARS_PER_DOLLAR,
  );
}

export function dollarThresholdsCrossed(previousCostNanos: number, nextCostNanos: number) {
  const previousDollars = Math.floor(previousCostNanos / NANODOLLARS_PER_DOLLAR);
  const nextDollars = Math.floor(nextCostNanos / NANODOLLARS_PER_DOLLAR);
  return Array.from(
    { length: Math.max(0, nextDollars - previousDollars) },
    (_, index) => previousDollars + index + 1,
  );
}

export function sonnet5PricingSnapshot() {
  return { ...SONNET_5_PRICING };
}
