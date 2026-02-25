/**
 * @title Consuming and transforming streams
 *
 * Build a practical stream pipeline for order events with pure transforms,
 * effectful enrichment, and terminal operations for collection, folding, and
 * side-effecting consumers.
 */
import { Chunk, Effect, Sink, Stream } from "effect"

type Order = {
  readonly id: string
  readonly customerId: string
  readonly status: "paid" | "refunded"
  readonly subtotalCents: number
  readonly shippingCents: number
  readonly country: "US" | "CA"
}

type NormalizedOrder = Order & {
  readonly totalCents: number
}

type EnrichedOrder = NormalizedOrder & {
  readonly taxCents: number
  readonly grandTotalCents: number
  readonly priority: "normal" | "high"
}

// Start with structured order events from an in-memory source.
export const orderEvents = Stream.fromIterable<Order>([
  {
    id: "ord_1001",
    customerId: "cus_1",
    status: "paid",
    subtotalCents: 4_500,
    shippingCents: 500,
    country: "US"
  },
  {
    id: "ord_1002",
    customerId: "cus_2",
    status: "refunded",
    subtotalCents: 8_000,
    shippingCents: 700,
    country: "CA"
  },
  {
    id: "ord_1003",
    customerId: "cus_3",
    status: "paid",
    subtotalCents: 12_000,
    shippingCents: 900,
    country: "CA"
  },
  {
    id: "ord_1004",
    customerId: "cus_4",
    status: "paid",
    subtotalCents: 40_000,
    shippingCents: 1_200,
    country: "US"
  }
])

// A pure transformation step for per-order totals.
export const normalizedOrders = orderEvents.pipe(
  Stream.map((order): NormalizedOrder => ({
    ...order,
    totalCents: order.subtotalCents + order.shippingCents
  }))
)

// Filter down to only billable orders.
export const paidOrders = normalizedOrders.pipe(
  Stream.filter((order) => order.status === "paid")
)

const enrichOrder: (order: NormalizedOrder) => Effect.Effect<EnrichedOrder> = Effect.fnUntraced(
  function*(order: NormalizedOrder) {
    // Simulate effectful enrichment (for example, tax/risk lookup).
    yield* Effect.sleep("5 millis")

    const taxRate = order.country === "US" ? 0.08 : 0.13
    const taxCents = Math.round(order.totalCents * taxRate)

    return {
      ...order,
      taxCents,
      grandTotalCents: order.totalCents + taxCents,
      priority: order.totalCents >= 20_000 ? "high" : "normal"
    }
  }
)

// `Stream.mapEffect` performs effectful per-element transforms with concurrency control.
export const enrichedPaidOrders = paidOrders.pipe(
  Stream.mapEffect(enrichOrder, { concurrency: 4 })
)

// `runCollect` gathers all stream outputs into an immutable array.
export const collectedOrders = Stream.runCollect(enrichedPaidOrders)

// Use `Chunk` utilities when you want `Chunk`-specific APIs.
export const collectedOrderIds = collectedOrders.pipe(
  Effect.map((orders) => Chunk.fromIterable(orders)),
  Effect.map((orders) => Chunk.map(orders, (order) => order.id))
)

// `runForEach` executes an effectful consumer for every element.
export const logOrders = enrichedPaidOrders.pipe(
  Stream.runForEach((order) => Effect.logInfo(`Order ${order.id} total=$${(order.grandTotalCents / 100).toFixed(2)}`))
)

// `runFold` reduces the stream to one accumulated value.
export const totalRevenueCents = enrichedPaidOrders.pipe(
  Stream.runFold(() => 0, (acc: number, order) => acc + order.grandTotalCents)
)

// `run` lets you consume a stream through any Sink.
export const totalRevenueViaSink = enrichedPaidOrders.pipe(
  Stream.map((order) => order.grandTotalCents),
  Stream.run(Sink.sum)
)

// `runHead` and `runLast` capture edge elements as Option values.
export const firstLargeOrder = enrichedPaidOrders.pipe(
  Stream.filter((order) => order.priority === "high"),
  Stream.runHead
)

export const lastLargeOrder = enrichedPaidOrders.pipe(
  Stream.filter((order) => order.priority === "high"),
  Stream.runLast
)

// Windowing-style operators help shape what downstream consumers see.
export const firstTwoOrders = enrichedPaidOrders.pipe(
  Stream.take(2),
  Stream.runCollect
)

export const afterWarmupOrder = enrichedPaidOrders.pipe(
  Stream.drop(1),
  Stream.runCollect
)

export const untilLargeOrder = enrichedPaidOrders.pipe(
  Stream.takeWhile((order) => order.priority === "normal"),
  Stream.runCollect
)
