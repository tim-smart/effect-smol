/**
 * @title Creating Layers that run background tasks
 *
 * Build a metrics collector service with `Layer.effect` that starts a scoped
 * background fiber to periodically flush buffered metrics.
 */
import { Effect, Layer, Ref, Schedule, Schema, ServiceMap } from "effect"

export class MetricsFlushError extends Schema.TaggedErrorClass<MetricsFlushError>()("MetricsFlushError", {
  cause: Schema.Defect
}) {}

declare const sendToMetricsBackend: (
  metrics: ReadonlyArray<{ readonly metric: string; readonly value: number }>
) => Promise<void>

type MetricBuffer = ReadonlyMap<string, number>

export class MetricsCollector extends ServiceMap.Service<MetricsCollector, {
  record(metric: string, value: number): Effect.Effect<void>
}>()("app/MetricsCollector") {
  static readonly layer = Layer.effect(
    MetricsCollector,
    Effect.gen(function*() {
      const bufferedMetrics = yield* Ref.make<MetricBuffer>(new Map())

      const pushBatch = Effect.fn("MetricsCollector.pushBatch")((metrics: MetricBuffer) =>
        Effect.tryPromise({
          try: () =>
            sendToMetricsBackend(
              Array.from(metrics, ([metric, value]) => ({ metric, value }))
            ),
          catch: (cause) => new MetricsFlushError({ cause })
        })
      )

      // Use Effect.fn for internal layer logic, keeping the flush routine named
      // and reusable from both the background loop and shutdown finalizer.
      const flush = Effect.fn("MetricsCollector.flush")(function*() {
        const snapshot = yield* Ref.getAndSet(bufferedMetrics, new Map())
        if (snapshot.size === 0) {
          return
        }
        yield* pushBatch(snapshot)
        yield* Effect.logInfo(`Flushed ${snapshot.size} metric(s)`)
      })

      // Fork a scoped fiber so the loop is interrupted automatically when the
      // layer scope closes.
      yield* Effect.repeat(flush(), Schedule.spaced("15 seconds")).pipe(
        Effect.onInterrupt(() => Effect.logInfo("MetricsCollector flush loop interrupted: layer scope closed")),
        Effect.forkScoped
      )

      // Also flush on normal scope shutdown so final in-memory metrics are not lost.
      yield* Effect.addFinalizer(() =>
        flush().pipe(
          Effect.catchTag("MetricsFlushError", (error) =>
            Effect.logWarning(`Failed to flush metrics during shutdown: ${error.cause}`))
        )
      )

      const record = Effect.fn("MetricsCollector.record")((metric: string, value: number) =>
        Ref.update(bufferedMetrics, (current) => {
          const next = new Map(current)
          next.set(metric, (next.get(metric) ?? 0) + value)
          return next
        })
      )

      return MetricsCollector.of({ record })
    })
  )
}

// The background flush loop lives as long as the layer scope lives.
// When this scoped program completes, the layer is released and the loop is interrupted.
export const scopedCollectorProgram = Effect.scoped(
  Effect.gen(function*() {
    const metrics = yield* MetricsCollector

    yield* metrics.record("http.requests", 1)
    yield* metrics.record("http.requests", 1)
    yield* metrics.record("http.errors", 1)

    yield* Effect.sleep("20 seconds")
  }).pipe(
    Effect.provide(MetricsCollector.layer)
  )
)
