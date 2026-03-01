/**
 * @title Stateful chat sessions
 *
 * `Chat` maintains conversation history automatically. Each call to
 * `generateText` appends the user message and model response to an internal
 * `Ref`, so follow-up prompts carry full context.
 */
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { Config, Effect, Layer, Ref, Schema, ServiceMap } from "effect"
import { AiError, Chat } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

// ---------------------------------------------------------------------------
// Provider setup (reuse the pattern from the LanguageModel example)
// ---------------------------------------------------------------------------

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY")
}).pipe(Layer.provide(FetchHttpClient.layer))

// ---------------------------------------------------------------------------
// Service that wraps Chat for a domain use-case
// ---------------------------------------------------------------------------

export class AiWriterError extends Schema.TaggedErrorClass<AiWriterError>()("AiWriterError", {
  reason: AiError.AiErrorReason
}) {
  static fromAiError(error: AiError.AiError) {
    return new AiWriterError({ reason: error.reason })
  }
}

export class AiAssistant extends ServiceMap.Service<AiAssistant, {
  // Start a new conversation, ask a question, then ask a follow-up that
  // relies on the previous context.
  chat(messages: ReadonlyArray<string>): Effect.Effect<ReadonlyArray<string>, AiWriterError>
  // Initialize a chat with a system prompt, then ask a question.
  chatWithSystem(
    system: string,
    question: string
  ): Effect.Effect<string, AiWriterError>
  // Demonstrate serializing and restoring a chat session.
  roundTrip(
    question: string
  ): Effect.Effect<string, AiWriterError | Schema.SchemaError>
}>()("docs/AiAssistant") {
  static readonly layer = Layer.effect(
    AiAssistant,
    Effect.gen(function*() {
      // Resolve the model layer inside the service constructor. This makes
      // the `LanguageModel` available to every method without leaking the
      // provider-specific `OpenAiClient` requirement into their signatures.
      const modelLayer = yield* OpenAiLanguageModel.model("gpt-4.1")

      // ---------------------------------------------------------------------------
      // 1. Chat.empty — basic multi-turn conversation
      // ---------------------------------------------------------------------------

      // `Chat.empty` creates a fresh chat backed by an internal `Ref<Prompt>`.
      // Every call to `generateText` appends the user message and the model
      // response, so later prompts automatically include full history.
      const chat = Effect.fn("AiAssistant.chat")(
        function*(messages: ReadonlyArray<string>) {
          const session = yield* Chat.empty

          const responses: Array<string> = []
          for (const message of messages) {
            const response = yield* session.generateText({ prompt: message })
            responses.push(response.text)
          }

          // You can inspect the accumulated history at any point through the
          // `history` ref on the chat instance.
          const history = yield* Ref.get(session.history)
          yield* Effect.logInfo(
            `Conversation has ${history.content.length} messages`
          )

          return responses
        },
        Effect.provide(modelLayer),
        Effect.mapError((error) => AiWriterError.fromAiError(error))
      )

      // ---------------------------------------------------------------------------
      // 2. Chat.fromPrompt — initialize with a system message
      // ---------------------------------------------------------------------------

      // `Chat.fromPrompt` accepts any `Prompt.RawInput`: a plain string (user
      // message), an array of encoded messages, or an existing `Prompt`. Passing
      // an array with a system message sets the tone for the entire conversation.
      const chatWithSystem = Effect.fn("AiAssistant.chatWithSystem")(
        function*(system: string, question: string) {
          const session = yield* Chat.fromPrompt([
            { role: "system", content: system }
          ])

          const response = yield* session.generateText({ prompt: question })
          return response.text
        },
        Effect.provide(modelLayer),
        Effect.mapError((error) => AiWriterError.fromAiError(error))
      )

      // ---------------------------------------------------------------------------
      // 3. Export / import lifecycle
      // ---------------------------------------------------------------------------

      // `chat.exportJson` serializes the full conversation history to a JSON
      // string. `Chat.fromJson` restores a chat from that string so you can
      // persist sessions across process restarts.
      const roundTrip = Effect.fn("AiAssistant.roundTrip")(
        function*(question: string) {
          // Start a conversation and generate one response
          const original = yield* Chat.empty
          yield* original.generateText({ prompt: question })

          // Serialize the entire conversation to JSON
          const json = yield* original.exportJson

          // Restore the session from the serialized JSON
          const restored = yield* Chat.fromJson(json)

          // The restored chat has the same history as the original, so the
          // model receives the full prior context.
          const response = yield* restored.generateText({
            prompt: "Summarize what we discussed so far."
          })

          return response.text
        },
        Effect.provide(modelLayer),
        Effect.mapError(
          (error) =>
            error._tag === "AiError"
              ? AiWriterError.fromAiError(error)
              : error
        )
      )

      return AiAssistant.of({
        chat,
        chatWithSystem,
        roundTrip
      })
    })
  ).pipe(Layer.provide(OpenAiClientLayer))
}

// ---------------------------------------------------------------------------
// Example program
// ---------------------------------------------------------------------------

export const program: Effect.Effect<
  void,
  AiWriterError | Schema.SchemaError,
  AiAssistant
> = Effect.gen(function*() {
  const assistant = yield* AiAssistant

  // Multi-turn: the second message automatically includes context from the
  // first thanks to Chat's internal history.
  yield* assistant.chat([
    "What are the main benefits of functional programming?",
    "Can you give a concrete example of the first benefit you mentioned?"
  ])

  // System prompt sets the conversation persona before the user message.
  yield* assistant.chatWithSystem(
    "You are a concise technical writer. Keep answers under 50 words.",
    "Explain dependency injection."
  )

  // Round-trip: export a chat to JSON then restore and continue the session.
  yield* assistant.roundTrip("What is the Effect library?")
})
