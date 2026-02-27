/**
 * @since 1.0.0
 */

/**
 * OpenAI-specific error metadata fields.
 *
 * @since 1.0.0
 * @category models
 */
export type OpenAiErrorMetadata = {
  /**
   * The OpenAI error code returned by the API.
   */
  readonly errorCode: string | null
  /**
   * The OpenAI error type returned by the API.
   */
  readonly errorType: string | null
  /**
   * The unique request ID for debugging with OpenAI support.
   */
  readonly requestId: string | null
}

/**
 * OpenAI-specific rate limit metadata fields.
 *
 * Extends base error metadata with rate limit specific information from
 * OpenAI's rate limit headers.
 *
 * @since 1.0.0
 * @category models
 */
export type OpenAiRateLimitMetadata = OpenAiErrorMetadata & {
  /**
   * The rate limit type (e.g. "requests", "tokens").
   */
  readonly limit: string | null
  /**
   * Number of remaining requests in the current window.
   */
  readonly remaining: number | null
  /**
   * Time until the request rate limit resets.
   */
  readonly resetRequests: string | null
  /**
   * Time until the token rate limit resets.
   */
  readonly resetTokens: string | null
}

declare module "effect/unstable/ai/AiError" {
  export interface RateLimitErrorMetadata extends ProviderMetadata {
    readonly openai?: OpenAiRateLimitMetadata | null
  }

  export interface RateLimitError {
    readonly metadata: RateLimitErrorMetadata
  }

  export interface QuotaExhaustedErrorMetadata extends ProviderMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  export interface QuotaExhaustedError {
    readonly metadata: QuotaExhaustedErrorMetadata
  }

  export interface AuthenticationErrorMetadata extends ProviderMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  export interface AuthenticationError {
    readonly metadata: AuthenticationErrorMetadata
  }

  export interface ContentPolicyErrorMetadata extends ProviderMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  export interface ContentPolicyError {
    readonly metadata: ContentPolicyErrorMetadata
  }

  export interface InvalidRequestErrorMetadata extends ProviderMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  export interface InvalidRequestError {
    readonly metadata: InvalidRequestErrorMetadata
  }

  export interface InternalProviderErrorMetadata extends ProviderMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  export interface InternalProviderError {
    readonly metadata: InternalProviderErrorMetadata
  }

  export interface InvalidOutputErrorMetadata extends ProviderMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  export interface InvalidOutputError {
    readonly metadata: InvalidOutputErrorMetadata
  }

  export interface UnknownErrorMetadata extends ProviderMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  export interface UnknownError {
    readonly metadata: UnknownErrorMetadata
  }
}
