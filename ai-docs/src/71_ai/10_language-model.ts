/**
 * @title Using LanguageModel for text, objects, and streams
 *
 * Configure a provider once, then use `LanguageModel` for plain text
 * generation, schema-validated object generation, and streaming responses.
 */
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { Config, Effect, Layer, Schema, ServiceMap, Stream } from "effect"
import { LanguageModel, Model, type Response } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

export class LaunchPlan extends Schema.Class<LaunchPlan>("LaunchPlan")({
  audience: Schema.Literals(["developers", "operators", "platform teams"]),
  channels: Schema.Array(Schema.String),
  launchDate: Schema.String,
  summary: Schema.String,
  keyRisks: Schema.Array(Schema.String)
}) {}

export class AiWriter extends ServiceMap.Service<AiWriter, {
  draftAnnouncement(product: string): Effect.Effect<{
    readonly provider: string
    readonly text: string
  }, unknown>
  extractLaunchPlan(notes: string): Effect.Effect<LaunchPlan, unknown>
  streamReleaseHighlights(version: string): Stream.Stream<string, unknown>
}>()("docs/AiWriter") {
  static readonly layer = Layer.effect(
    AiWriter,
    Effect.gen(function*() {
      const model = yield* LanguageModel.LanguageModel
      const provider = yield* Model.ProviderName

      const draftAnnouncement = Effect.fn("AiWriter.draftAnnouncement")(function*(product: string) {
        const response = yield* model.generateText({
          prompt: `Write a short launch announcement for ${product}. ` +
            "Keep it concise and include one concrete user benefit."
        })

        // `LanguageModel.generateText` exposes convenience fields so you can
        // inspect usage and finish reason without parsing content parts.
        yield* Effect.logInfo(
          `${provider} finished with ${response.finishReason}. outputTokens=${response.usage.outputTokens.total}`
        )

        return {
          provider,
          text: response.text
        }
      })

      const extractLaunchPlan = Effect.fn("AiWriter.extractLaunchPlan")(function*(notes: string) {
        const response = yield* model.generateObject({
          objectName: "launch_plan",
          prompt:
            "Convert these notes into a launch plan object with audience, channels, launchDate, summary, and keyRisks:\n" +
            notes,
          // The generated object is validated and decoded through this schema.
          schema: LaunchPlan
        })

        return response.value
      })

      const streamReleaseHighlights = (version: string) =>
        model.streamText({
          prompt: `Write release highlights for version ${version} as a short bulleted list.`
        }).pipe(
          Stream.filter((part): part is Response.TextDeltaPart => part.type === "text-delta"),
          Stream.map((part) => part.delta)
        )

      return AiWriter.of({
        draftAnnouncement,
        extractLaunchPlan,
        streamReleaseHighlights
      })
    })
  )
}

export const OpenAiProviderLayer = OpenAiLanguageModel.model("gpt-5.2").pipe(
  Layer.provide(OpenAiClient.layerConfig({
    apiKey: Config.redacted("OPENAI_API_KEY")
  })),
  Layer.provide(FetchHttpClient.layer)
)

// For another provider (for example, Anthropic), build a Layer that provides
// `LanguageModel.LanguageModel | Model.ProviderName` and swap it in below.
export declare const AnthropicProviderLayer: Layer.Layer<LanguageModel.LanguageModel | Model.ProviderName, never>

// Keep business logic provider-agnostic: only the final layer changes.
export const languageModelLayer = (provider: "openai" | "anthropic") =>
  provider === "openai"
    ? OpenAiProviderLayer
    : AnthropicProviderLayer

export const publishLaunchAssets = Effect.gen(function*() {
  const writer = yield* AiWriter

  const announcement = yield* writer.draftAnnouncement("Effect Cloud")

  const plan = yield* writer.extractLaunchPlan(
    "Audience is platform teams. Use blog + newsletter. Ship on 2026-05-30. " +
      "Main message: lower incident response time. Risk: migration guide still incomplete."
  )

  // `streamText` emits many part types; this method returns only text deltas.
  yield* writer.streamReleaseHighlights("4.1.0").pipe(
    Stream.runForEach((chunk) => Effect.log(chunk))
  )

  return { announcement, plan }
})

export const runWithOpenAi = publishLaunchAssets.pipe(
  Effect.provide(AiWriter.layer.pipe(Layer.provide(languageModelLayer("openai"))))
)

export const runWithAnthropic = publishLaunchAssets.pipe(
  Effect.provide(AiWriter.layer.pipe(Layer.provide(languageModelLayer("anthropic"))))
)
