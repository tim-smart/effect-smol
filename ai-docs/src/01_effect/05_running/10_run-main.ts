/**
 * @title Running effects with NodeRuntime and BunRuntime
 *
 * Use `NodeRuntime.runMain` to run an Effect program as your process
 * entrypoint. It handles process exit codes, signal interruption, and optional
 * automatic error reporting.
 */
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Schedule, ServiceMap } from "effect"

export class AppConfig extends ServiceMap.Service<AppConfig, {
  readonly serviceName: string
  readonly queueName: string
  readonly pollIntervalMillis: number
}>()("app/AppConfig") {
  static readonly layer = Layer.succeed(
    AppConfig,
    AppConfig.of({
      serviceName: "invoice-worker",
      queueName: "invoice-events",
      pollIntervalMillis: 5_000
    })
  )
}

const pollQueue = Effect.fn("pollQueue")((queueName: string) => Effect.logDebug(`Polling ${queueName} for new jobs...`))

const workerLoop = Effect.fn("workerLoop")(function*() {
  const config = yield* AppConfig

  yield* Effect.logInfo(`Starting ${config.serviceName} (queue=${config.queueName})`)

  yield* Effect.repeat(
    pollQueue(config.queueName),
    {
      schedule: Schedule.spaced(config.pollIntervalMillis)
    }
  )
})

export const program = workerLoop().pipe(
  // Provide dependencies locally before handing the program to the runtime.
  Effect.provide(AppConfig.layer)
)

// `runMain` installs SIGINT / SIGTERM handlers and interrupts running fibers
// for graceful shutdown.
NodeRuntime.runMain(program, {
  // Disable automatic error reporting if your app already centralizes it.
  disableErrorReporting: true
})

// Bun has the same API shape:
// BunRuntime.runMain(program, { disableErrorReporting: true })
