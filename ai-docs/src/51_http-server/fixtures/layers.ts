import { Effect, Layer, Redacted } from "effect"
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi"
import { Api, Authorization, CurrentUser, Unauthorized } from "./Api.ts"
import { UserRepo } from "./UserRepo.ts"

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
