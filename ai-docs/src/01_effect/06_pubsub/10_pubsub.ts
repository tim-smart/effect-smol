/**
 * @title Broadcasting domain events with PubSub
 *
 * Build an in-process event bus with `PubSub` and expose it as a service so
 * multiple consumers can independently process the same events.
 */
import { Effect, Layer, PubSub, type Scope, ServiceMap } from "effect"

export type OrderEvent =
  | { readonly _tag: "OrderPlaced"; readonly orderId: string }
  | { readonly _tag: "PaymentCaptured"; readonly orderId: string }
  | { readonly _tag: "OrderShipped"; readonly orderId: string }

export class OrderEvents extends ServiceMap.Service<OrderEvents, {
  readonly publish: (event: OrderEvent) => Effect.Effect<boolean>
  readonly publishAll: (events: ReadonlyArray<OrderEvent>) => Effect.Effect<boolean>
  readonly subscribe: Effect.Effect<PubSub.Subscription<OrderEvent>, never, Scope.Scope>
}>()("ai-docs/OrderEvents") {
  static readonly layer = Layer.effect(
    OrderEvents,
    Effect.gen(function*() {
      // Backpressured PubSub with replay gives reliable fan-out and lets late
      // subscribers catch up on recent events after restarts.
      const pubsub = yield* PubSub.bounded<OrderEvent>({
        capacity: 256,
        replay: 50
      })

      const publish = Effect.fnUntraced(function*(event: OrderEvent) {
        return yield* PubSub.publish(pubsub, event)
      })

      const publishAll = Effect.fnUntraced(function*(events: ReadonlyArray<OrderEvent>) {
        return yield* PubSub.publishAll(pubsub, events)
      })

      return OrderEvents.of({
        publish,
        publishAll,
        subscribe: PubSub.subscribe(pubsub)
      })
    })
  )
}

// Each subscriber sees the same events and can consume at its own pace.
export const fanOutToMultipleConsumers = Effect.scoped(
  Effect.gen(function*() {
    const orderEvents = yield* OrderEvents

    const billingSubscription = yield* orderEvents.subscribe
    const shippingSubscription = yield* orderEvents.subscribe

    yield* orderEvents.publishAll([
      { _tag: "OrderPlaced", orderId: "ord-100" },
      { _tag: "PaymentCaptured", orderId: "ord-100" },
      { _tag: "OrderShipped", orderId: "ord-100" }
    ])

    const billingEvents = yield* PubSub.takeUpTo(billingSubscription, 3)
    const shippingEvents = yield* PubSub.takeUpTo(shippingSubscription, 3)

    return { billingEvents, shippingEvents }
  })
).pipe(
  Effect.provide(OrderEvents.layer)
)

// Replay lets a subscriber that starts later still receive recent events.
export const lateSubscriberReceivesReplay = Effect.scoped(
  Effect.gen(function*() {
    const orderEvents = yield* OrderEvents

    yield* orderEvents.publishAll([
      { _tag: "OrderPlaced", orderId: "ord-200" },
      { _tag: "PaymentCaptured", orderId: "ord-200" },
      { _tag: "OrderShipped", orderId: "ord-200" }
    ])

    const subscription = yield* orderEvents.subscribe
    return yield* PubSub.takeAll(subscription)
  })
).pipe(
  Effect.provide(OrderEvents.layer)
)
