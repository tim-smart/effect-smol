import { Schema, ServiceMap } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi
} from "effect/unstable/httpapi"

export class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
}) {}

export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()("UserNotFound", {
  id: Schema.Number
}) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()("Unauthorized", {
  message: Schema.String
}) {}

export class CurrentUser extends ServiceMap.Service<CurrentUser, {
  readonly id: number
}>()("app/CurrentUser") {}

export class Authorization extends HttpApiMiddleware.Service<Authorization, {
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
