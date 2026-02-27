import { Effect, Layer, LogLevel, Stream } from "effect"
import { Logs } from "../Logs.ts"
import { LogRpcs } from "./rpc.ts"

export const LogRpcsLayerNoDeps = LogRpcs.toLayer(Effect.gen(function*() {
  // Access the Logs service to implement the RPC handlers.
  const logs = yield* Logs

  // Return the RPC handlers using the LogRpcs.of constructor.
  return LogRpcs.of({
    "logs.stream": ({ minimumLevel }) =>
      logs.logs.pipe(
        Stream.filter((entry) => LogLevel.isGreaterThanOrEqualTo(entry.level, minimumLevel))
      )
  })
}))

// Export a production layer that pre-provides the dependencies of the RPC
// handlers.
export const LogRpcsLayer = LogRpcsLayerNoDeps.pipe(
  Layer.provide(Logs.layer)
)
