/**
 * @title Dynamic resources with LayerMap
 *
 * Manage tenant-specific resources with `LayerMap.Service`. Each tenant gets a
 * cached database pool that can be reused, expired when idle, or invalidated
 * on demand.
 */
import { Effect, Layer, LayerMap, Schema, ServiceMap } from "effect"

class DatabaseQueryError extends Schema.TaggedErrorClass<DatabaseQueryError>()("DatabaseQueryError", {
  tenantId: Schema.String,
  cause: Schema.Defect
}) {}

type UserRecord = {
  readonly id: number
  readonly email: string
}

let nextConnectionId = 0

export class DatabasePool extends ServiceMap.Service<DatabasePool, {
  readonly tenantId: string
  readonly connectionId: number
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<UserRecord>, DatabaseQueryError>
}>()("app/DatabasePool") {
  // A layer factory that builds one pool per tenant.
  static readonly layer = (tenantId: string) =>
    Layer.effect(
      DatabasePool,
      Effect.acquireRelease(
        Effect.sync(() => {
          const connectionId = ++nextConnectionId

          return DatabasePool.of({
            tenantId,
            connectionId,
            query: Effect.fn("DatabasePool.query")((sql: string) =>
              Effect.try({
                try: () => {
                  if (sql.includes("DROP ")) {
                    throw new Error("Destructive SQL statements are disabled")
                  }
                  return [
                    { id: 1, email: `admin@${tenantId}.example.com` },
                    { id: 2, email: `ops@${tenantId}.example.com` }
                  ]
                },
                catch: (cause) => new DatabaseQueryError({ tenantId, cause })
              })
            )
          })
        }),
        (pool) => Effect.logInfo(`Closing tenant pool ${pool.tenantId}#${pool.connectionId}`)
      )
    )
}

export class PoolMap extends LayerMap.Service<PoolMap>()("app/PoolMap", {
  // `lookup` tells LayerMap how to build a layer for each tenant key.
  lookup: (tenantId: string) => DatabasePool.layer(tenantId),

  // If a pool is not used for this duration, it is released automatically.
  idleTimeToLive: "10 minutes"
}) {}

const queryUsersForCurrentTenant = Effect.gen(function*() {
  const pool = yield* DatabasePool
  return yield* pool.query("SELECT id, email FROM users ORDER BY id")
})

// `PoolMap.get` returns a tenant-specific Layer that provides `DatabasePool`.
export const queryTenantUsers = Effect.fn("queryTenantUsers")((tenantId: string) =>
  queryUsersForCurrentTenant.pipe(
    Effect.provide(PoolMap.get(tenantId))
  )
)

// `PoolMap.services` gives direct scoped access to all services for a key.
export const inspectTenantPool = Effect.fn("inspectTenantPool")(function*(tenantId: string) {
  const services = yield* PoolMap.services(tenantId)
  const pool = ServiceMap.get(services, DatabasePool)

  return {
    tenantId: pool.tenantId,
    connectionId: pool.connectionId
  }
})

// `PoolMap.invalidate` forces a key to rebuild on the next access.
export const refreshTenantPool = Effect.fn("refreshTenantPool")((tenantId: string) => PoolMap.invalidate(tenantId))

export const program = Effect.gen(function*() {
  const usersBeforeInvalidate = yield* queryTenantUsers("acme")
  const poolBeforeInvalidate = yield* inspectTenantPool("acme")

  yield* refreshTenantPool("acme")

  const poolAfterInvalidate = yield* inspectTenantPool("acme")

  return {
    usersBeforeInvalidate,
    poolBeforeInvalidate,
    poolAfterInvalidate
  }
}).pipe(
  Effect.provide(PoolMap.layer),
  Effect.scoped
)
