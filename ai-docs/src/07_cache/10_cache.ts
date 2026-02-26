/**
 * @title Caching effects with Cache
 *
 * Build a service with in-memory caching, deduplicated lookups, manual
 * population / invalidation, and dynamic TTL policies.
 */
import { Cache, Duration, Effect, Layer, Schema, ServiceMap } from "effect"

const sleep = (millis: number) => new Promise<void>((resolve) => setTimeout(resolve, millis))

class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  email: Schema.String,
  plan: Schema.Union([
    Schema.Literal("free"),
    Schema.Literal("pro"),
    Schema.Literal("enterprise")
  ])
}) {}

class UserLookupError extends Schema.TaggedErrorClass<UserLookupError>()("UserLookupError", {
  userId: Schema.Number,
  cause: Schema.Defect
}) {}

const fakeUsers = new Map<number, User>([
  [1, new User({ id: 1, email: "ada@example.com", plan: "pro" })],
  [2, new User({ id: 2, email: "lin@example.com", plan: "enterprise" })]
])

const lookupUserFromApi = Effect.fn("lookupUserFromApi")((userId: number) =>
  Effect.tryPromise({
    try: async () => {
      await sleep(75)
      const user = fakeUsers.get(userId)
      if (user === undefined) {
        throw new Error(`User ${userId} not found`)
      }
      return user
    },
    catch: (cause) => new UserLookupError({ userId, cause })
  })
)

export class UserDirectory extends ServiceMap.Service<UserDirectory, {
  readonly getById: (userId: number) => Effect.Effect<User, UserLookupError>
  readonly preload: (user: User) => Effect.Effect<void>
  readonly invalidate: (userId: number) => Effect.Effect<void>
}>()("app/UserDirectory") {
  static readonly layer = Layer.effect(
    UserDirectory,
    Effect.gen(function*() {
      // `Cache.make` gives a fixed TTL policy for all entries.
      const usersCache = yield* Cache.make({
        lookup: lookupUserFromApi,
        capacity: 1_000,
        timeToLive: "5 minutes"
      })

      const getById = Effect.fn("UserDirectory.getById")((userId: number) =>
        // Concurrent `Cache.get` calls for the same key deduplicate the lookup.
        Cache.get(usersCache, userId)
      )

      // Manual set is useful for write-through patterns after mutations.
      const preload = Effect.fn("UserDirectory.preload")((user: User) => Cache.set(usersCache, user.id, user))

      // Invalidate removes stale entries so the next read re-fetches.
      const invalidate = Effect.fn("UserDirectory.invalidate")((userId: number) => Cache.invalidate(usersCache, userId))

      return UserDirectory.of({ getById, preload, invalidate })
    })
  )
}

// A deduplicated read burst: all three lookups share one in-flight fetch.
export const deduplicatedLookup = Effect.gen(function*() {
  const users = yield* UserDirectory
  return yield* Effect.all([
    users.getById(1),
    users.getById(1),
    users.getById(1)
  ], { concurrency: "unbounded" })
}).pipe(
  Effect.provide(UserDirectory.layer)
)

class Session extends Schema.Class<Session>("Session")({
  id: Schema.String,
  userId: Schema.Number,
  plan: Schema.Union([
    Schema.Literal("free"),
    Schema.Literal("pro"),
    Schema.Literal("enterprise")
  ])
}) {}

class SessionLookupError extends Schema.TaggedErrorClass<SessionLookupError>()("SessionLookupError", {
  sessionId: Schema.String,
  cause: Schema.Defect
}) {}

const lookupSession = Effect.fn("lookupSession")((sessionId: string) =>
  Effect.tryPromise({
    try: async () => {
      await sleep(30)
      if (sessionId.startsWith("missing_")) {
        throw new Error("Session not found")
      }
      const plan = sessionId.startsWith("ent_")
        ? "enterprise"
        : sessionId.startsWith("pro_")
        ? "pro"
        : "free"

      return new Session({
        id: sessionId,
        userId: 1,
        plan
      })
    },
    catch: (cause) => new SessionLookupError({ sessionId, cause })
  })
)

// `Cache.makeWith` lets TTL depend on both the result and the key.
export const sessionCache = Cache.makeWith({
  lookup: lookupSession,
  capacity: 2_000,
  timeToLive: (exit, sessionId) => {
    if (exit._tag === "Failure") {
      // Retry failed lookups soon.
      return Duration.seconds(20)
    }
    if (exit.value.plan === "enterprise") {
      return Duration.minutes(30)
    }
    return sessionId.startsWith("guest_")
      ? Duration.minutes(1)
      : Duration.minutes(10)
  }
})
