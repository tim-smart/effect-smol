import { Effect, Layer, Schema, ServiceMap } from "effect"
import { User, UserId } from "./domain/User.ts"

export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>("acme/Users/UserNotFound")("UserNotFound", {
  id: UserId
}) {}

// Define a service interface for managing users.
export class Users extends ServiceMap.Service<Users, {
  findById(id: UserId): Effect.Effect<User, UserNotFound>
}>()("acme/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function*() {
      const users = new Map<string, User>([
        ["1", new User({ id: UserId.makeUnsafe("1"), name: "Ada" })],
        ["2", new User({ id: UserId.makeUnsafe("2"), name: "Lin" })]
      ])

      const findById = Effect.fn("Users.findById")(function*(id: UserId) {
        const user = yield* Effect.fromNullishOr(users.get(id)).pipe(
          Effect.mapError(() => new UserNotFound({ id }))
        )
        return user
      })

      return Users.of({ findById })
    })
  )
}
