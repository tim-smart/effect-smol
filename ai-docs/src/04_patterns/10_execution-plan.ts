/**
 * @title Custom fallback strategies with ExecutionPlan
 *
 * Compose retry and fallback behavior in discrete steps so each attempt can use
 * a different provider layer.
 */
import { Effect, ExecutionPlan, type Layer, Schedule } from "effect"
import { LanguageModel } from "effect/unstable/ai"

// Keep provider-specific wiring out of this example so the focus stays on
// plan composition.
declare const FastModel: Layer.Layer<LanguageModel.LanguageModel>
declare const ReliableModel: Layer.Layer<LanguageModel.LanguageModel>
declare const LastResortModel: Layer.Layer<LanguageModel.LanguageModel>

// Step 1: use the fast model, retrying only transient failures.
const fastModelPlan = ExecutionPlan.make({
  provide: FastModel,
  attempts: 2,
  schedule: Schedule.exponential("250 millis"),
  while: (error: { readonly isRetryable: boolean }) => error.isRetryable
})

// Step 2 + 3: switch to increasingly reliable providers.
const reliabilityPlan = ExecutionPlan.make(
  {
    provide: ReliableModel,
    attempts: 3,
    schedule: Schedule.spaced("1 second")
  },
  {
    // No `attempts` means one final attempt.
    provide: LastResortModel
  }
)

// Plans can be authored in separate modules and merged at the application
// boundary.
export const GenerationPlan = ExecutionPlan.merge(fastModelPlan, reliabilityPlan)

const runPromptWithMetadata = Effect.fn("runPromptWithMetadata")(function*(prompt: string) {
  // `CurrentMetadata` tells us which step/attempt this run is in.
  const metadata = yield* ExecutionPlan.CurrentMetadata

  yield* Effect.logInfo(
    `ExecutionPlan step=${metadata.stepIndex + 1} attempt=${metadata.attempt}`
  )

  const response = yield* LanguageModel.generateText({ prompt })
  return response.text
})

export const summarizeIncident = Effect.withExecutionPlan(
  runPromptWithMetadata("Summarize this incident report in three bullet points."),
  GenerationPlan
)
