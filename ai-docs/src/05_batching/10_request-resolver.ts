/**
 * @title Batching requests with RequestResolver
 *
 * Define request types with `Request.Class`, resolve them in batches with
 * `RequestResolver.make`, and run many `Effect.request` calls concurrently.
 */
import { Array, Effect, Exit, Ref, Request, RequestResolver, Schema } from "effect"

export class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
}) {}

export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()("UserNotFound", {
  id: Schema.Number
}) {}

// Request classes model a single external lookup.
export class GetUserById extends Request.Class<{ readonly id: number }, User, UserNotFound> {}

// Simulate an external data source that supports batched lookup.
const usersTable = new Map<number, User>([
  [1, new User({ id: 1, name: "Ada Lovelace", email: "ada@acme.dev" })],
  [2, new User({ id: 2, name: "Alan Turing", email: "alan@acme.dev" })],
  [3, new User({ id: 3, name: "Grace Hopper", email: "grace@acme.dev" })]
])

const makeResolver = Effect.fnUntraced(function*() {
  // Track each batch so we can inspect what the resolver executed.
  const executedBatches = yield* Ref.make<ReadonlyArray<ReadonlyArray<number>>>([])

  const fetchUsersBatch = Effect.fnUntraced(function*(ids: ReadonlyArray<number>) {
    // Record the exact batch IDs sent to the external system.
    yield* Ref.update(executedBatches, (batches) => [...batches, ids])

    return new Map(ids.flatMap((id) => {
      const user = usersTable.get(id)
      return user ? [[id, user] as const] : []
    }))
  })

  const resolver = RequestResolver.make<GetUserById>(
    Effect.fnUntraced(function*(entries) {
      // `entries` can contain duplicate IDs. Collapse them before the external
      // call so we only fetch each user once per batch.
      const uniqueIds = Array.dedupe(entries.map((entry) => entry.request.id))
      const usersById = yield* fetchUsersBatch(uniqueIds)

      // Every request entry still receives its own completion result.
      for (const entry of entries) {
        const user = usersById.get(entry.request.id)
        entry.completeUnsafe(
          user
            ? Exit.succeed(user)
            : Exit.fail(new UserNotFound({ id: entry.request.id }))
        )
      }
    })
  )

  const getUserById = Effect.fnUntraced(function*(id: number) {
    return yield* Effect.request(new GetUserById({ id }), resolver)
  })

  return { getUserById, executedBatches } as const
})

// Run multiple lookups concurrently. The resolver receives one batch and
// internally deduplicates repeated IDs for the external call.
export const batchedLookupExample = Effect.gen(function*() {
  const { getUserById, executedBatches } = yield* makeResolver()

  const users = yield* Effect.forEach([1, 2, 1, 3, 2], getUserById, {
    concurrency: "unbounded"
  })

  const batches = yield* Ref.get(executedBatches)

  // `batches` is `[[1, 2, 3]]`, while `users` keeps caller order and duplicate
  // lookups.
  return { users, batches } as const
})
