/**
 * @title Defining and serving RPCs
 *
 * Define request-response and streaming RPCs, serve them and define a client to call them.
 */
import { BrowserSocket } from "@effect/platform-browser"
import { NodeHttpServer, NodeRuntime, NodeSocket, NodeSocketServer } from "@effect/platform-node"
import { Effect, Layer, ServiceMap, Stream } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/unstable/http"
import { RpcClient, type RpcClientError, RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "node:http"
import { UserId } from "./fixtures/domain/User.ts"
import { LogRpcsLayer } from "./fixtures/Logs/rpc-handlers.ts"
import { AllRpcs } from "./fixtures/Rpcs.ts"
import { UserRpcsLayer } from "./fixtures/Users/rpc-handlers.ts"

// **Make sure to look at the fixture files** to see how the RPC handlers and RPC
// groups are defined. The RPC groups are defined in Rpcs.ts, and the handlers
// are defined in rpc-handlers.ts.

// You can serve a RpcServer over a raw TCP socket
export const RpcSocketLayer = RpcServer.layer(AllRpcs).pipe(
  // Provide all the RPC handler layers
  Layer.provide([
    UserRpcsLayer,
    LogRpcsLayer
  ]),
  // Provide the Socket protocol
  Layer.provide(RpcServer.layerProtocolSocketServer),
  // Provide the desired serialization format for the RPC protocol. This must
  // match the format used by the client(s)
  Layer.provide(RpcSerialization.layerMsgPack),
  // Provide the SockerServer implementation to use
  Layer.provide(NodeSocketServer.layer({ port: 3001 }))
)

// Or if you want to serve over HTTP, you can mount the RpcServer into an
// HttpRouter.
const RpcHttpLayer = RpcServer.layerHttp({
  group: AllRpcs,
  path: "/rpc",
  protocol: "websocket"
}).pipe(
  // Provide all the RPC handler layers
  Layer.provide([
    UserRpcsLayer,
    LogRpcsLayer
  ]),
  // Provide the desired serialization format for the RPC protocol. This must
  // match the format used by the client(s)
  Layer.provide(RpcSerialization.layerNdjson)
)

export const HttpLayer = HttpRouter.serve(RpcHttpLayer).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

// Run the server layers using Layer.launch
Layer.mergeAll(RpcSocketLayer, HttpLayer).pipe(
  Layer.launch,
  NodeRuntime.runMain
)

export class RpcClientWebsocket extends ServiceMap.Service<
  RpcClientWebsocket,
  RpcClient.FromGroup<typeof AllRpcs, RpcClientError.RpcClientError>
>()("acme/RpcClientWebsocket") {
  // Create a client layer that can be used to access the RPC server. This must
  // match the protocol and serialization layers used by the server.
  static readonly layer = Layer.effect(RpcClientWebsocket, RpcClient.make(AllRpcs)).pipe(
    // Websocket protocol needs to use RpcClient.layerProtocolSocket
    // You can configure the protocol layer with options, such as retrying
    // transient errors.
    Layer.provide(
      RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
        // Provide the Socket implementation to use for the protocol layer.
        // In this case, we want to connect to the server over a WebSocket, so we
        // use the Socket.layerWebSocket implementation, and provide the URL of
        // the server.
        Layer.provide(BrowserSocket.layerWebSocket("ws://localhost:3000/rpc")),
        // On node.js, you would use NodeSocket instead of BrowserSocket.
        Layer.provide(NodeSocket.layerWebSocket("ws://localhost:3000/rpc"))
      )
    ),
    // Provide the matching serialization layer for the server.
    Layer.provide(RpcSerialization.layerNdjson)
  )
}

export class RpcClientHttp extends ServiceMap.Service<
  RpcClientHttp,
  RpcClient.FromGroup<typeof AllRpcs, RpcClientError.RpcClientError>
>()("acme/RpcClientHttp") {
  // If your server is using the "http" protocol, you would use the
  // RpcClient.layerProtocolHttp layer.
  static readonly layer = Layer.effect(RpcClientHttp, RpcClient.make(AllRpcs)).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({ url: "http://localhost:3000/rpc" }).pipe(
        // Provide the HttpClient to use
        Layer.provide(FetchHttpClient.layer)
      )
    ),
    // Provide the matching serialization layer for the server.
    Layer.provide(RpcSerialization.layerNdjson)
  )
}

export class RpcClientSocket extends ServiceMap.Service<
  RpcClientSocket,
  RpcClient.FromGroup<typeof AllRpcs, RpcClientError.RpcClientError>
>()("acme/RpcClientSocket") {
  // If your server is using raw sockets, you would use the
  // RpcClient.layerProtocolSocket layer, and provide the net Socket
  // implementation.
  static readonly layer = Layer.effect(RpcClientHttp, RpcClient.make(AllRpcs)).pipe(
    Layer.provide(
      RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
        // Provide a net Socket that connects to the server. You can configure
        // the Socket with options.
        Layer.provide(NodeSocket.layerNet({ host: "localhost", port: 3001 }))
      )
    ),
    // Provide the matching serialization layer for the server.
    Layer.provide(RpcSerialization.layerMsgPack)
  )
}

// Example usage of an RpcClient
export const program = Effect.gen(function*() {
  const client = yield* RpcClientWebsocket

  const user = yield* client["users.get"]({ id: UserId.makeUnsafe("1") })
  const recentIssues = yield* client["logs.stream"]({ minimumLevel: "Warn" }).pipe(
    Stream.runCollect
  )

  return { user, recentIssues }
}).pipe(
  Effect.provide(RpcClientWebsocket.layer)
)
