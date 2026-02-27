/**
 * @title Getting started with HttpApi
 *
 * Define a schema-first API, implement handlers, secure endpoints with
 * middleware, serve it over HTTP, and call it using a generated typed client.
 */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Redacted, Ref, Schema, ServiceMap } from "effect"
import { FetchHttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  HttpApiSwagger,
  OpenApi
} from "effect/unstable/httpapi"
import { createServer } from "node:http"

class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
}) {}

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()("UserNotFound", {
  id: Schema.Number
}) {}

class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()("Unauthorized", {
  message: Schema.String
}) {}

class CurrentUser extends ServiceMap.Service<CurrentUser, {
  readonly id: number
}>()("app/CurrentUser") {}

class Authorization extends HttpApiMiddleware.Service<Authorization, {
  provides: CurrentUser
}>()("app/Authorization", {
  error: Unauthorized.pipe(HttpApiSchema.status(401)),
  requiredForClient: true,
  security: {
    bearer: HttpApiSecurity.bearer
  }
}) {}

class UsersApi extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("list", "/", {
      query: {
        search: Schema.optional(Schema.String)
      },
      success: Schema.Array(User)
    }),
    HttpApiEndpoint.get("getById", "/:id", {
      params: {
        id: Schema.FiniteFromString
      },
      success: User,
      error: UserNotFound.pipe(HttpApiSchema.status(404))
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct({
        name: Schema.String,
        email: Schema.String
      }),
      success: User
    }),
    HttpApiEndpoint.get("me", "/me", {
      success: User,
      error: UserNotFound.pipe(HttpApiSchema.status(404))
    })
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({
    title: "Users",
    description: "User management endpoints"
  }))
{}

class SystemApi extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("health", "/health", {
    success: HttpApiSchema.NoContent
  })
) {}

export class Api extends HttpApi.make("user-api")
  .add(UsersApi.prefix("/users"))
  .add(SystemApi)
  .annotateMerge(OpenApi.annotations({
    title: "Acme User API"
  }))
{}

class UserRepo extends ServiceMap.Service<UserRepo, {
  list(search: string | undefined): Effect.Effect<Array<User>>
  getById(id: number): Effect.Effect<User, UserNotFound>
  create(input: { readonly name: string; readonly email: string }): Effect.Effect<User>
}>()("app/UserRepo") {
  static readonly layer = Layer.effect(
    UserRepo,
    Effect.gen(function*() {
      const users = yield* Ref.make(
        new Map<number, User>([
          [
            1,
            new User({
              id: 1,
              name: "Admin",
              email: "admin@acme.dev"
            })
          ]
        ])
      )
      const nextId = yield* Ref.make(2)

      const list = Effect.fnUntraced(function*(search: string | undefined) {
        const allUsers = Array.from((yield* Ref.get(users)).values())
        if (search === undefined || search.length === 0) {
          return allUsers
        }
        const normalized = search.toLowerCase()
        return allUsers.filter((user) =>
          user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized)
        )
      })

      const getById = Effect.fnUntraced(function*(id: number) {
        const user = (yield* Ref.get(users)).get(id)
        if (user === undefined) {
          return yield* Effect.fail(new UserNotFound({ id }))
        }
        return user
      })

      const create = Effect.fnUntraced(function*(input: { readonly name: string; readonly email: string }) {
        const id = yield* Ref.get(nextId)
        yield* Ref.update(nextId, (current) => current + 1)
        const user = new User({ id, ...input })
        yield* Ref.update(users, (current) => new Map(current).set(user.id, user))
        return user
      })

      return UserRepo.of({ list, getById, create })
    })
  )
}

export const AuthorizationLive = Layer.succeed(Authorization)({
  bearer: (httpEffect, { credential }) => {
    const token = Redacted.value(credential)
    if (token !== "dev-token") {
      return Effect.fail(new Unauthorized({ message: "Missing or invalid bearer token" }))
    }
    return Effect.provideService(httpEffect, CurrentUser, { id: 1 })
  }
})

export const UsersApiLive = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fnUntraced(function*(handlers) {
    const repo = yield* UserRepo

    return handlers
      .handle("list", ({ query }) => repo.list(query.search))
      .handle("getById", ({ params }) => repo.getById(params.id))
      .handle("create", ({ payload }) => repo.create(payload))
      .handle("me", () =>
        CurrentUser.asEffect().pipe(
          Effect.flatMap((currentUser) => repo.getById(currentUser.id))
        ))
  })
).pipe(
  Layer.provide([UserRepo.layer, AuthorizationLive])
)

export const SystemApiLive = HttpApiBuilder.group(
  Api,
  "system",
  (handlers) => handlers.handle("health", () => Effect.void)
)

export const HttpApiRoutesLive = Layer.mergeAll(
  HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide([UsersApiLive, SystemApiLive])
  ),
  HttpApiSwagger.layer(Api, {
    path: "/docs"
  })
)

export const HttpServerLive = HttpRouter.serve(HttpApiRoutesLive).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

export const AuthorizationClient = HttpApiMiddleware.layerClient(
  Authorization,
  Effect.fnUntraced(function*({ next, request }) {
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

  const me = yield* client.users.me()

  return { created, fetched, me }
}).pipe(
  Effect.provide(FetchHttpClient.layer)
)

Layer.launch(HttpServerLive).pipe(
  NodeRuntime.runMain
)
