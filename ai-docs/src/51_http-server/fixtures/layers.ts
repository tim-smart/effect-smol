import { Effect, Layer, Redacted } from "effect"
import { HttpApiBuilder, HttpApiError, HttpApiSwagger } from "effect/unstable/httpapi"
import { Api, Authorization, CurrentUser, SearchQueryTooShort, Unauthorized } from "./Api.ts"
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
  Effect.fn(function*(handlers) {
    const repo = yield* UserRepo

    return handlers
      .handle("list", ({ query }) => repo.list(query.search))
      .handle("search", ({ payload }) => {
        const search = typeof payload === "string" ? payload : payload.search
        if (search.length < 2) {
          return Effect.fail(new SearchQueryTooShort({ minimumLength: 2 }))
        }
        if (search === "bad-request") {
          return Effect.fail(new HttpApiError.BadRequest({}))
        }
        return repo.list(search).pipe(
          Effect.flatMap((users) =>
            users.length === 0
              ? Effect.fail(new HttpApiError.NotFound({}))
              : Effect.succeed(users)
          )
        )
      })
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
