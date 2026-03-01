/**
 * @title Defining and using AI tools
 *
 * Define tools with schemas, group them into toolkits, implement handlers,
 * pass them to `LanguageModel.generateText`, and inspect tool calls and
 * results. Also covers provider-defined tools like OpenAI web search.
 */
import { OpenAiClient, OpenAiLanguageModel, OpenAiTool } from "@effect/ai-openai"
import { Config, Effect, Layer, Schema, ServiceMap, Stream } from "effect"
import { AiError, LanguageModel, Tool, Toolkit } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

// ---------------------------------------------------------------------------
// 1. Defining tools
// ---------------------------------------------------------------------------

// Each tool has a name, an optional description, a parameters schema that the
// model fills in, and a success schema for the handler result. The description
// is shown to the model to help it decide when to call the tool.
const SearchProducts = Tool.make("SearchProducts", {
  description: "Search the product catalog by keyword",
  parameters: Schema.Struct({
    query: Schema.String,
    maxResults: Schema.Number.pipe(Schema.withDecodingDefault(() => 10))
  }),
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      price: Schema.Number
    })
  )
})

const GetInventory = Tool.make("GetInventory", {
  description: "Check current stock level for a product",
  parameters: Schema.Struct({
    productId: Schema.String
  }),
  success: Schema.Struct({
    productId: Schema.String,
    available: Schema.Number
  })
})

// ---------------------------------------------------------------------------
// 2. Grouping tools into a Toolkit
// ---------------------------------------------------------------------------

// `Toolkit.make` accepts any number of tools and produces a typed toolkit that
// knows the names and schemas of every tool it contains.
const ProductToolkit = Toolkit.make(SearchProducts, GetInventory)

// ---------------------------------------------------------------------------
// 3. Implementing handlers via toLayer
// ---------------------------------------------------------------------------

// `toLayer` returns a `Layer` that satisfies the handler requirements for every
// tool in the toolkit. Each handler receives the decoded parameters and returns
// an Effect producing the success type.
const ProductToolkitLive = ProductToolkit.toLayer({
  SearchProducts: ({ query, maxResults }) =>
    // In a real application, this would query a database or search index.
    Effect.succeed([
      { id: "p-1", name: `${query} widget`, price: 19.99 },
      { id: "p-2", name: `${query} gadget`, price: 29.99 }
    ].slice(0, maxResults)),
  GetInventory: ({ productId }) => Effect.succeed({ productId, available: 42 })
})

// ---------------------------------------------------------------------------
// 4. Using tools with LanguageModel
// ---------------------------------------------------------------------------

// Provider setup (same pattern as the language-model example).
const OpenAiClientLive = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY")
}).pipe(Layer.provide(FetchHttpClient.layer))

export class ProductAssistantError extends Schema.TaggedErrorClass<ProductAssistantError>()(
  "ProductAssistantError",
  { reason: AiError.AiErrorReason }
) {}

// Wrap tool-enabled generation in a service to follow best practices.
export class ProductAssistant extends ServiceMap.Service<ProductAssistant, {
  answer(question: string): Effect.Effect<{
    readonly text: string
    readonly toolCallCount: number
  }, ProductAssistantError>
}>()("docs/ProductAssistant") {
  static readonly layer = Layer.effect(
    ProductAssistant,
    Effect.gen(function*() {
      // Resolve the LanguageModel and toolkit handlers at layer construction
      // time, so they are captured in the closure below.
      const model = yield* LanguageModel.LanguageModel
      const toolkit = yield* ProductToolkit

      const answer = Effect.fn("ProductAssistant.answer")(
        function*(question: string) {
          // Pass the toolkit to `generateText`. The model can call any tool in
          // the toolkit; the framework resolves parameters, invokes handlers,
          // and feeds results back automatically.
          const response = yield* model.generateText({
            prompt: question,
            toolkit
          })

          // -------------------------------------------------------------------
          // 5. Inspecting tool calls and results
          // -------------------------------------------------------------------

          // `response.toolCalls` lists every tool the model invoked, each with
          // the tool name, a unique id, and the decoded parameters.
          for (const call of response.toolCalls) {
            yield* Effect.log(`Tool call: ${call.name} id=${call.id}`)
          }

          // `response.toolResults` lists the resolved results, each with the
          // tool name, id, decoded result, and an `isFailure` flag.
          for (const result of response.toolResults) {
            yield* Effect.log(
              `Tool result: ${result.name} id=${result.id} isFailure=${result.isFailure}`
            )
          }

          return {
            text: response.text,
            toolCallCount: response.toolCalls.length
          }
        },
        // Map AI errors into our domain error type
        Effect.mapError((error) =>
          new ProductAssistantError({
            reason: error instanceof AiError.AiError ? error.reason : error
          })
        )
      )

      return ProductAssistant.of({ answer })
    })
  ).pipe(
    // The toolkit handler layer must be provided so the framework can invoke
    // the tool handlers when the model makes tool calls.
    Layer.provide(ProductToolkitLive)
  )
}

// ---------------------------------------------------------------------------
// 6. Provider-defined tools
// ---------------------------------------------------------------------------

// Some providers offer built-in tools (web search, code interpreter, etc.)
// that run server-side. Use `Tool.providerDefined` or the pre-built
// definitions from provider packages.

// OpenAI's web search tool is pre-defined in `@effect/ai-openai`. Calling it
// produces a tool instance that can be merged into any toolkit.
const webSearch = OpenAiTool.WebSearch({
  search_context_size: "medium"
})

// Combine user-defined and provider-defined tools in a single toolkit.
const AssistantToolkit = Toolkit.make(SearchProducts, GetInventory, webSearch)

// Only user-defined tools that require handlers appear in `toLayer`. The
// provider-defined `WebSearch` is executed server-side by the provider.
const AssistantToolkitLive = AssistantToolkit.toLayer({
  SearchProducts: ({ query, maxResults }) =>
    Effect.succeed([
      { id: "p-1", name: `${query} widget`, price: 19.99 }
    ].slice(0, maxResults)),
  GetInventory: ({ productId }) => Effect.succeed({ productId, available: 42 })
})

// Use the combined toolkit the same way. The model decides whether to call
// your tools, the provider tool, or just respond with text.
export const assistantProgram = Effect.gen(function*() {
  const model = yield* LanguageModel.LanguageModel
  const toolkit = yield* AssistantToolkit

  const response = yield* model.generateText({
    prompt: "What is the current price of wireless headphones? " +
      "Also check the latest online reviews.",
    toolkit
  })

  // The response may contain results from both your tools and the provider
  // tool. Provider-executed tool results have `providerExecuted: true`.
  for (const result of response.toolResults) {
    yield* Effect.log(
      `${result.name}: providerExecuted=${result.providerExecuted}`
    )
  }

  yield* Effect.log(response.text)
}).pipe(Effect.provide(AssistantToolkitLive))

// ---------------------------------------------------------------------------
// 7. Streaming with tools
// ---------------------------------------------------------------------------

// `streamText` also supports toolkits. The stream emits tool-call and
// tool-result parts interleaved with text deltas, so you can show progress as
// the model works.
export const streamWithTools = LanguageModel.streamText({
  prompt: "Find me a product under $25",
  toolkit: ProductToolkit
}).pipe(
  // Each stream part has a discriminated `type` field. Use `Stream.tap` or
  // `Stream.mapEffect` to react to specific part types as they arrive.
  Stream.mapEffect((part) => {
    switch (part.type) {
      case "text-delta":
        return Effect.log(`text: ${part.delta}`)
      case "tool-call":
        return Effect.log(`tool call: ${part.name}`)
      case "tool-result":
        return Effect.log(`tool result: ${part.name}`)
      default:
        return Effect.void
    }
  }),
  // Run the full stream to completion.
  Stream.runDrain,
  Effect.provide(ProductToolkitLive)
)

// ---------------------------------------------------------------------------
// 8. Wiring everything together
// ---------------------------------------------------------------------------

// Compose the full application layer exactly like any other Effect service.
export const ProductAssistantLive = ProductAssistant.layer.pipe(
  Layer.provide(OpenAiLanguageModel.model("gpt-4.1")),
  Layer.provide(OpenAiClientLive)
)
