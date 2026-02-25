/**
 * @title Creating HttpApi servers
 *
 * Define schema-first endpoints, implement grouped handlers, add auth middleware,
 * and wire everything into an HTTP server with Swagger documentation.
 */
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer, Redacted, Ref, Schema, ServiceMap } from "effect"
import { HttpRouter } from "effect/unstable/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  HttpApiSwagger
} from "effect/unstable/httpapi"
import * as Http from "node:http"

class User extends Schema.Class<User>("User")({
  id: Schema.Int,
  name: Schema.String
}) {}

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()("UserNotFound", {
  id: Schema.Int
}) {}

class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()("Unauthorized", {}) {}

class CurrentUser extends ServiceMap.Service<CurrentUser, {
  readonly userId: number
  readonly role: string
}>()("CurrentUser") {}

class Authorization extends HttpApiMiddleware.Service<Authorization, {
  readonly provides: CurrentUser
  readonly error: Unauthorized
}>()("Authorization", {
  error: Unauthorized,
  security: {
    bearer: HttpApiSecurity.bearer
  }
}) {}

const CreateUserPayload = Schema.Struct({
  name: Schema.String
})

class UsersApi extends HttpApiGroup.make("users").add(
  HttpApiEndpoint.get("getUser", "/:id", {
    params: {
      id: Schema.FiniteFromString
    },
    success: User,
    error: UserNotFound.pipe(HttpApiSchema.status(404))
  }),
  HttpApiEndpoint.post("createUser", "/", {
    payload: CreateUserPayload,
    success: User.pipe(HttpApiSchema.status(201))
  })
).middleware(Authorization) {}

class Api extends HttpApi.make("myapp").add(UsersApi.prefix("/users")) {}

class UserRepo extends ServiceMap.Service<UserRepo, {
  readonly findById: (id: number) => Effect.Effect<User, UserNotFound>
  readonly create: (payload: { readonly name: string }) => Effect.Effect<User>
}>()("UserRepo") {
  static readonly layer = Layer.effect(
    UserRepo,
    Effect.gen(function*() {
      const nextId = yield* Ref.make(1)
      const users = yield* Ref.make(
        new Map<number, User>([
          [1, new User({ id: 1, name: "Ada" })]
        ])
      )

      const findById = Effect.fn("UserRepo.findById")((id: number) =>
        Ref.get(users).pipe(
          Effect.flatMap((table) => {
            const user = table.get(id)
            return user
              ? Effect.succeed(user)
              : Effect.fail(new UserNotFound({ id }))
          })
        )
      )

      const create = Effect.fn("UserRepo.create")(function*({ name }: { readonly name: string }) {
        const id = yield* Ref.updateAndGet(nextId, (value) => value + 1)
        const user = new User({ id, name })

        yield* Ref.update(users, (table) => {
          const copy = new Map(table)
          copy.set(id, user)
          return copy
        })

        return user
      })

      return UserRepo.of({ findById, create })
    })
  )
}

const AuthorizationLive = Layer.succeed(Authorization)({
  bearer: (effect, { credential }) =>
    Redacted.value(credential) === "demo-token"
      ? Effect.provideService(effect, CurrentUser, { userId: 42, role: "admin" })
      : Effect.fail(new Unauthorized({}))
})

export const UsersApiLive = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fnUntraced(function*(handlers) {
    const userRepo = yield* UserRepo

    return handlers
      .handle("getUser", ({ params }) => userRepo.findById(params.id))
      .handle(
        "createUser",
        Effect.fnUntraced(function*({ payload }) {
          const currentUser = yield* CurrentUser

          yield* Effect.logInfo(`createUser called by ${currentUser.role}:${currentUser.userId}`)

          return yield* userRepo.create(payload)
        })
      )
  })
).pipe(
  Layer.provide([
    UserRepo.layer,
    AuthorizationLive
  ])
)

// `HttpApiBuilder.layer` turns the schema into a router layer once every
// endpoint in every group has a handler implementation.
export const HttpApiLive = Layer.provide(HttpApiBuilder.layer(Api), [
  UsersApiLive
])

// Add interactive API docs at /docs (Swagger UI generated from the same API
// schema that powers runtime validation).
const HttpDocsLive = HttpApiSwagger.layer(Api, {
  path: "/docs"
})

export const HttpServerLive = HttpRouter.serve(
  Layer.mergeAll(HttpApiLive, HttpDocsLive),
  {
    disableListenLog: true
  }
).pipe(
  Layer.provideMerge(NodeHttpServer.layer(Http.createServer, { port: 3000 }))
)
