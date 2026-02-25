## Working with AI modules

Effect's AI modules provide a provider-agnostic interface for language models.
You can generate text, decode structured objects with `Schema`, stream partial
responses, and swap providers with Layer wiring instead of rewriting
application logic.

Providers include OpenAI (`@effect/ai-openai`), Anthropic
(`@effect/ai-anthropic`), OpenRouter (`@effect/ai-openrouter`), and
OpenAI-compatible APIs (`@effect/ai-openai-compat`).
