import { Effect, Layer, Ref, ServiceMap } from "effect"
import { User, UserNotFound } from "./Api.ts"

export class UserRepo extends ServiceMap.Service<UserRepo, {
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
