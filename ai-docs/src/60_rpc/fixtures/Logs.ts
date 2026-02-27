import { DateTime, Effect, Layer, Logger, Queue, ServiceMap, Stream } from "effect"
import { LogEntry } from "./domain/LogEntry.js"

export class Logs extends ServiceMap.Service<Logs, {
  readonly logs: Stream.Stream<LogEntry>
}>()("acme/Logs") {
  // Use Layer.unwrap to create a Layer that provides both the Logs service and
  // a Logger that writes to it.
  static readonly layer = Layer.unwrap(
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<LogEntry>()

      // Create a proxy logger that write to the queue.
      const logger = Logger.make((opts) => {
        const message = Logger.formatSimple.log(opts)
        Queue.offerUnsafe(
          queue,
          new LogEntry({
            message,
            timestamp: DateTime.fromDateUnsafe(opts.date),
            level: opts.logLevel
          })
        )
      })

      // Turn the queue into a stream
      const logs = Stream.fromQueue(queue)

      const logsLayer = Layer.succeed(Logs, Logs.of({ logs }))
      const loggerLayer = Logger.layer([logger], {
        mergeWithExisting: true
      })

      return Layer.merge(logsLayer, loggerLayer)
    })
  )
}
