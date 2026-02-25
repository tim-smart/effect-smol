/**
 * @title Customizing logging
 *
 * Configure structured logs, log-level filtering, and custom logger layers for
 * production applications.
 */
import { Effect, Layer, Logger, LogLevel, References } from "effect"

// Build a logger layer that emits one JSON line per log entry.
export const JsonLoggerLive = Logger.layer([Logger.consoleJson])

// Raise the minimum level to "Warn" to skip debug/info logs.
export const WarnAndAbove = Layer.succeed(References.MinimumLogLevel, "Warn")

// Define a custom logger for app-specific formatting and routing.
export const appLogger = Logger.make((options) => {
  if (!LogLevel.isGreaterThanOrEqualTo(options.logLevel, "Info")) {
    return
  }

  const message = Array.isArray(options.message)
    ? options.message.map(String).join(" ")
    : String(options.message)

  const annotations = Object.entries(options.fiber.getRef(References.CurrentLogAnnotations))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ")

  console.log(
    `${options.date.toISOString()} [${options.logLevel}] ${message}${annotations.length > 0 ? ` ${annotations}` : ""}`
  )
})

export const AppLoggerLive = Logger.layer([appLogger])

export const logCheckoutFlow = Effect.gen(function*() {
  yield* Effect.logDebug("loading checkout state")

  yield* Effect.logInfo("validating cart")
  yield* Effect.logWarning("inventory is low for one line item")
  yield* Effect.logError("payment provider timeout")
}).pipe(
  // Attach structured metadata to all log lines emitted by this effect.
  Effect.annotateLogs({
    service: "checkout-api",
    route: "POST /checkout"
  }),
  // Add a duration span so each log line includes checkout=<N>ms metadata.
  Effect.withLogSpan("checkout")
)

// Compose logging concerns as layers and provide them once at the program edge.
export const productionLogging = logCheckoutFlow.pipe(
  Effect.provide(JsonLoggerLive),
  Effect.provide(WarnAndAbove)
)

export const customLogging = logCheckoutFlow.pipe(
  Effect.provide(AppLoggerLive),
  Effect.provideService(References.MinimumLogLevel, "Info")
)
