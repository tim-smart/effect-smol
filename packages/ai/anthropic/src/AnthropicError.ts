/**
 * Anthropic error metadata augmentation.
 *
 * Provides Anthropic-specific metadata fields for AI error types through module
 * augmentation, enabling typed access to Anthropic error details.
 *
 * @since 1.0.0
 */

/**
 * Anthropic-specific error metadata fields.
 *
 * @since 1.0.0
 * @category models
 */
export type AnthropicErrorMetadata = {
  /**
   * The Anthropic error type returned by the API.
   */
  readonly errorType: string | null
  /**
   * The unique request ID for debugging with Anthropic support.
   */
  readonly requestId: string | null
}

/**
 * Anthropic-specific rate limit metadata fields.
 *
 * Extends base error metadata with rate limit specific information from
 * Anthropic's rate limit headers.
 *
 * @since 1.0.0
 * @category models
 */
export type AnthropicRateLimitMetadata = AnthropicErrorMetadata & {
  /**
   * Number of requests allowed in the current period.
   */
  readonly requestsLimit: number | null
  /**
   * Number of requests remaining in the current period.
   */
  readonly requestsRemaining: number | null
  /**
   * Time when the request rate limit resets.
   */
  readonly requestsReset: string | null
  /**
   * Number of tokens allowed in the current period.
   */
  readonly tokensLimit: number | null
  /**
   * Number of tokens remaining in the current period.
   */
  readonly tokensRemaining: number | null
  /**
   * Time when the token rate limit resets.
   */
  readonly tokensReset: string | null
}

declare module "effect/unstable/ai/AiError" {
  export interface RateLimitErrorMetadata extends ProviderMetadata {
    readonly anthropic?: AnthropicRateLimitMetadata | null
  }

  export interface RateLimitError {
    readonly metadata: RateLimitErrorMetadata
  }

  export interface QuotaExhaustedErrorMetadata extends ProviderMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  export interface QuotaExhaustedError {
    readonly metadata: QuotaExhaustedErrorMetadata
  }

  export interface AuthenticationErrorMetadata extends ProviderMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  export interface AuthenticationError {
    readonly metadata: AuthenticationErrorMetadata
  }

  export interface ContentPolicyErrorMetadata extends ProviderMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  export interface ContentPolicyError {
    readonly metadata: ContentPolicyErrorMetadata
  }

  export interface InvalidRequestErrorMetadata extends ProviderMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  export interface InvalidRequestError {
    readonly metadata: InvalidRequestErrorMetadata
  }

  export interface InternalProviderErrorMetadata extends ProviderMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  export interface InternalProviderError {
    readonly metadata: InternalProviderErrorMetadata
  }

  export interface InvalidOutputErrorMetadata extends ProviderMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  export interface InvalidOutputError {
    readonly metadata: InvalidOutputErrorMetadata
  }

  export interface UnknownErrorMetadata extends ProviderMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  export interface UnknownError {
    readonly metadata: UnknownErrorMetadata
  }
}
