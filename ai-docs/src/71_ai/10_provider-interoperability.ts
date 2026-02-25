/**
 * @title Import multiple AI providers in one module
 *
 * This fixture ensures OpenAI and Anthropic providers can coexist in one
 * compilation unit.
 *
 * Before the metadata augmentation fix, this failed with TS2717 due to
 * conflicting declarations of `RateLimitError.metadata` in:
 * - `packages/ai/openai/src/OpenAiError.ts`
 * - `packages/ai/anthropic/src/AnthropicError.ts`
 */
import * as Anthropic from "@effect/ai-anthropic"
import * as OpenAi from "@effect/ai-openai"
import type { AiError } from "effect/unstable/ai"

const providers = {
  Anthropic,
  OpenAi
}

const metadata: AiError.RateLimitErrorMetadata = {
  anthropic: {
    errorType: "rate_limit_error",
    requestId: "anthropic-request-id",
    requestsLimit: 100,
    requestsRemaining: 0,
    requestsReset: "1s",
    tokensLimit: 1000,
    tokensRemaining: 0,
    tokensReset: "1s"
  },
  openai: {
    errorCode: "rate_limit_exceeded",
    errorType: "requests",
    requestId: "openai-request-id",
    limit: "requests",
    remaining: 0,
    resetRequests: "1s",
    resetTokens: "1s"
  }
}

void providers
void metadata
