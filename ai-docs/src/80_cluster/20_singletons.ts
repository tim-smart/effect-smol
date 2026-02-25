/**
 * @title Running cluster singletons
 *
 * Use `Singleton.make` for long-running jobs that must have exactly one active
 * instance across all runners.
 */
import { Effect, Layer, Schedule, ServiceMap } from "effect"
import { type Sharding, SingleRunner, Singleton } from "effect/unstable/cluster"
import type { SqlClient } from "effect/unstable/sql"

export class BillingGateway extends ServiceMap.Service<BillingGateway, {
  readonly pullPendingInvoiceIds: Effect.Effect<ReadonlyArray<string>>
  readonly reconcileInvoice: (invoiceId: string) => Effect.Effect<void>
}>()("app/BillingGateway") {}

declare const BillingGatewayLive: Layer.Layer<BillingGateway>

// Define one polling iteration, then repeat it on a schedule.
const reconcileOnce = Effect.fnUntraced(function*() {
  const gateway = yield* BillingGateway
  const pending = yield* gateway.pullPendingInvoiceIds

  if (pending.length === 0) {
    yield* Effect.logDebug("No pending invoices to reconcile")
    return
  }

  yield* Effect.forEach(pending, gateway.reconcileInvoice, {
    concurrency: 8,
    discard: true
  })

  yield* Effect.logInfo(`Reconciled ${pending.length} invoices`)
})

const runBillingReconciler = reconcileOnce().pipe(
  Effect.repeat(Schedule.spaced("30 seconds")),
  // If ownership moves to another runner, the old owner is interrupted.
  Effect.onInterrupt(() => Effect.logInfo("Lost singleton ownership; stopping billing reconciler"))
)

export const BillingReconcilerSingleton: Layer.Layer<never, never, Sharding.Sharding | BillingGateway> = Singleton.make(
  "billing/invoice-reconciler",
  runBillingReconciler,
  { shardGroup: "control-plane" }
)

// The singleton layer can be composed like any other layer.
export const BillingReconcilerLayer = BillingReconcilerSingleton.pipe(
  Layer.provide(BillingGatewayLive)
)

declare const SqlClientLive: Layer.Layer<SqlClient.SqlClient>

export const ShardingLive = SingleRunner.layer().pipe(
  Layer.provide(SqlClientLive)
)

// `Singleton.make` requires `Sharding`; provide it before launching.
export const ClusterAppLayer = BillingReconcilerLayer.pipe(
  Layer.provide(ShardingLive)
)

export const runClusterSingleton = Layer.launch(ClusterAppLayer)
