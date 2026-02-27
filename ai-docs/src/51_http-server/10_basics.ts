/**
 * @title Getting started with HttpApi
 *
 * Define a schema-first API, implement handlers, secure endpoints with
 * middleware, serve it over HTTP, and call it using a generated typed client.
 */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi"
import { createServer } from "node:http"
import { Api, Authorization } from "./fixtures/Api.ts"
import { HttpApiRoutesLive } from "./fixtures/layers.ts"

// This walkthrough focuses on runtime wiring and typed client usage.
// See the fixture files for the API schemas, endpoint definitions and handlers:
// - ./fixtures/Api.ts
// - ./fixtures/UserRepo.ts
// - ./fixtures/layers.ts

export const HttpServerLive = HttpRouter.serve(HttpApiRoutesLive).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

export const AuthorizationClient = HttpApiMiddleware.layerClient(
  Authorization,
  Effect.fn(function*({ next, request }) {
    return yield* next(HttpClientRequest.bearerToken(request, "dev-token"))
  })
)

// The generated client mirrors your API definition, so renames and schema
// changes are checked end-to-end at compile time.
export const callApi = Effect.gen(function*() {
  const client = yield* HttpApiClient.make(Api, {
    baseUrl: "http://localhost:3000"
  }).pipe(
    Effect.provide(AuthorizationClient)
  )

  yield* client.health()

  const created = yield* client.users.create({
    payload: {
      name: "Ada Lovelace",
      email: "ada@acme.dev"
    }
  })

  const fetched = yield* client.users.getById({
    params: {
      id: created.id
    }
  })

  const searchWithJson = yield* client.users.search({
    payload: {
      search: "ada"
    }
  })

  const searchWithText = yield* client.users.search({
    payload: "admin"
  })

  const me = yield* client.users.me()

  return { created, fetched, searchWithJson, searchWithText, me }
}).pipe(
  Effect.provide(FetchHttpClient.layer)
)

Layer.launch(HttpServerLive).pipe(
  NodeRuntime.runMain
)
