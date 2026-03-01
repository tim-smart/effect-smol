/**
 * @title Persisting cached values across restarts with PersistedCache
 *
 * Build a persisted cache for remote configuration lookups. The cache keeps an
 * in-memory layer for fast reads and a persistence layer for restart-safe data.
 */
import { Duration, Effect, Layer, Schema, ServiceMap } from "effect"
import { Persistable, PersistedCache, Persistence } from "effect/unstable/persistence"

const sleep = (millis: number) => new Promise<void>((resolve) => setTimeout(resolve, millis))

class RemoteConfig extends Schema.Class<RemoteConfig>("RemoteConfig")({
  environment: Schema.Union([
    Schema.Literal("dev"),
    Schema.Literal("staging"),
    Schema.Literal("prod")
  ]),
  version: Schema.Number,
  rolloutPercentage: Schema.Number
}) {}

// PersistedCache keys must implement `Persistable`.
//
// - `primaryKey` controls the persisted key format.
// - `success` / `error` schemas define how cached lookup results are encoded.
class ConfigRequest extends Persistable.Class<{
  payload: {
    readonly environment: "dev" | "staging" | "prod"
    readonly version: number
  }
}>()("ConfigRequest", {
  primaryKey: ({ environment, version }) => `${environment}:${version}`,
  success: RemoteConfig,
  error: Schema.String
}) {}

const fetchRemoteConfig = Effect.fn("fetchRemoteConfig")((request: ConfigRequest) =>
  Effect.tryPromise({
    try: async () => {
      await sleep(80)

      if (request.version <= 0) {
        throw new Error("version must be positive")
      }

      return new RemoteConfig({
        environment: request.environment,
        version: request.version,
        rolloutPercentage: request.environment === "prod" ? 20 : 100
      })
    },
    catch: () => "Unable to fetch remote config"
  })
)

type ConfigCacheError = string | Persistence.PersistenceError | Schema.SchemaError

export class ConfigCache extends ServiceMap.Service<ConfigCache, {
  readonly getConfig: (
    input: { readonly environment: ConfigRequest["environment"]; readonly version: number }
  ) => Effect.Effect<RemoteConfig, ConfigCacheError>
  readonly invalidateConfig: (
    input: { readonly environment: ConfigRequest["environment"]; readonly version: number }
  ) => Effect.Effect<void, Persistence.PersistenceError>
}>()("app/ConfigCache") {
  static readonly layer = Layer.effect(
    ConfigCache,
    Effect.gen(function*() {
      const cache = yield* PersistedCache.make({
        storeId: "remote-config",
        lookup: fetchRemoteConfig,
        timeToLive: (exit, request) => {
          if (exit._tag === "Failure") {
            return Duration.seconds(30)
          }
          return request.environment === "prod"
            ? Duration.minutes(10)
            : Duration.minutes(2)
        }
      })

      const getConfig = Effect.fn("ConfigCache.getConfig")((input: {
        readonly environment: ConfigRequest["environment"]
        readonly version: number
      }) => cache.get(new ConfigRequest(input)))

      const invalidateConfig = Effect.fn("ConfigCache.invalidateConfig")((input: {
        readonly environment: ConfigRequest["environment"]
        readonly version: number
      }) => cache.invalidate(new ConfigRequest(input)))

      return ConfigCache.of({ getConfig, invalidateConfig })
    })
  )
}

// PersistedCache requires a `Persistence` service.
//
// Use `Persistence.layerMemory` for tests/local dev.
// In production, switch to `Persistence.layerKvs`, `Persistence.layerSql`, or
// `Persistence.layerRedis` depending on your infrastructure.
export const ConfigCacheLive = ConfigCache.layer.pipe(
  Layer.provide(Persistence.layerMemory)
)

export const persistedCacheProgram = Effect.gen(function*() {
  const cache = yield* ConfigCache

  const config = yield* cache.getConfig({ environment: "prod", version: 3 })

  // Manually invalidate when upstream config has changed.
  yield* cache.invalidateConfig({ environment: "prod", version: 3 })

  return config
}).pipe(
  Effect.provide(ConfigCacheLive)
)
