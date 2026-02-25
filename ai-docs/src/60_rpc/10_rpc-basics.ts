/**
 * @title Defining and serving RPCs
 *
 * Define request-response and streaming RPCs, implement grouped handlers,
 * expose them over HTTP, and wire a typed client with the HTTP protocol layer.
 */
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer, Schema, ServiceMap, Stream } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/unstable/http"
import { Rpc, RpcClient, type RpcClientError, RpcGroup, RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"

const LogLevel = Schema.Union([
  Schema.Literal("info"),
  Schema.Literal("warn"),
  Schema.Literal("error")
])

class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

class LogEntry extends Schema.Class<LogEntry>("LogEntry")({
  level: LogLevel,
  message: Schema.String,
  timestamp: Schema.String
}) {}

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()("UserNotFound", {
  id: Schema.String
}) {}

class GetUser extends Rpc.make("GetUser", {
  payload: { id: Schema.String },
  success: User,
  error: UserNotFound
}) {}

class StreamLogs extends Rpc.make("StreamLogs", {
  payload: {
    minimumLevel: LogLevel
  },
  success: LogEntry,
  stream: true
}) {}

export const AppRpcs = RpcGroup.make(GetUser, StreamLogs)

const users = new Map<string, User>([
  ["1", new User({ id: "1", name: "Ada" })],
  ["2", new User({ id: "2", name: "Lin" })]
])

const logs: ReadonlyArray<LogEntry> = [
  new LogEntry({ level: "info", message: "Worker booted", timestamp: "2026-01-10T12:00:00.000Z" }),
  new LogEntry({ level: "warn", message: "Queue depth is high", timestamp: "2026-01-10T12:00:03.000Z" }),
  new LogEntry({ level: "error", message: "Job 92 failed", timestamp: "2026-01-10T12:00:05.000Z" })
]

const levelToSeverity = {
  info: 0,
  warn: 1,
  error: 2
} as const

// Group handlers in one layer so the RPC protocol and the implementation stay
// in sync.
export const AppRpcsLive = AppRpcs.toLayer(Effect.succeed(AppRpcs.of({
  // Request-response RPC handlers return Effect values.
  GetUser: Effect.fnUntraced(function*({ id }) {
    return yield* Effect.fromNullishOr(users.get(id)).pipe(
      Effect.mapError(() => new UserNotFound({ id }))
    )
  }),
  // Streaming RPC handlers return Stream values.
  StreamLogs: ({ minimumLevel }) =>
    Stream.fromIterable(logs).pipe(
      Stream.filter((entry) => levelToSeverity[entry.level] >= levelToSeverity[minimumLevel])
    )
})))

// `RpcServer.layerHttp` mounts the RPC protocol into the HttpRouter.
const RpcHttpLayer = RpcServer.layerHttp({
  group: AppRpcs,
  path: "/rpc",
  protocol: "http"
}).pipe(
  Layer.provide(AppRpcsLive)
)

export const RpcServerLive = HttpRouter.serve(RpcHttpLayer, {
  disableLogger: true,
  disableListenLog: true
}).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.provide(RpcSerialization.layerNdjson)
)

export class AppClient extends ServiceMap.Service<
  AppClient,
  RpcClient.FromGroup<typeof AppRpcs, RpcClientError.RpcClientError>
>()(
  "ai-docs/rpc/AppClient"
) {
  // `RpcClient.make` needs `RpcClient.Protocol` in context.
  // `layerProtocolHttp` supplies that protocol over HTTP.
  static readonly layer = Layer.effect(AppClient)(RpcClient.make(AppRpcs)).pipe(
    Layer.provide(RpcClient.layerProtocolHttp({ url: "http://localhost:3000/rpc" })),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(RpcSerialization.layerNdjson)
  )
}

export const program = Effect.gen(function*() {
  const client = yield* AppClient

  const user = yield* client.GetUser({ id: "1" })
  const recentIssues = yield* client.StreamLogs({ minimumLevel: "warn" }).pipe(
    Stream.runCollect
  )

  return { user, recentIssues }
})
