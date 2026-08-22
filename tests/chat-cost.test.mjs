import assert from "node:assert/strict";
import test from "node:test";

import {
  addChatUsage,
  calculateEstimatedCostNanos,
  chatUsageFromAnthropic,
  dollarThresholdsCrossed,
  emptyChatUsage,
  mergeCumulativeChatUsage,
} from "../server/chat-cost.ts";

test("calculates Sonnet 5 token, cache, and web-search costs in integer nanodollars", () => {
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheCreation5mInputTokens: 1_000_000,
    cacheCreation1hInputTokens: 1_000_000,
    cacheReadInputTokens: 1_000_000,
    webSearchRequests: 2,
  };

  assert.equal(calculateEstimatedCostNanos(usage, "claude-sonnet-5"), 18_720_000_000);
  assert.equal(calculateEstimatedCostNanos(usage, "unknown-model"), 0);
});

test("normalizes detailed Anthropic usage and merges cumulative stream updates", () => {
  const initial = chatUsageFromAnthropic({
    input_tokens: 120,
    output_tokens: 1,
    cache_creation_input_tokens: 30,
    cache_read_input_tokens: 80,
    cache_creation: {
      ephemeral_5m_input_tokens: 10,
      ephemeral_1h_input_tokens: 20,
    },
    server_tool_use: { web_search_requests: 1 },
  });
  assert.deepEqual(initial, {
    inputTokens: 120,
    outputTokens: 1,
    cacheCreation5mInputTokens: 10,
    cacheCreation1hInputTokens: 20,
    cacheReadInputTokens: 80,
    webSearchRequests: 1,
  });

  const streamed = mergeCumulativeChatUsage(initial, {
    output_tokens: 42,
    server_tool_use: { web_search_requests: 2 },
  });
  assert.deepEqual(streamed, { ...initial, outputTokens: 42, webSearchRequests: 2 });
  assert.deepEqual(addChatUsage(emptyChatUsage(), streamed), streamed);
});

test("returns every newly crossed whole-dollar warning threshold", () => {
  assert.deepEqual(dollarThresholdsCrossed(900_000_000, 3_200_000_000), [1, 2, 3]);
  assert.deepEqual(dollarThresholdsCrossed(3_200_000_000, 3_900_000_000), []);
});
