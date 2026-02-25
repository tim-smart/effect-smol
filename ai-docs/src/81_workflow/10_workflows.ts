/**
 * @title Defining durable workflows
 *
 * Build a durable order-processing workflow with typed activities, deterministic
 * idempotency keys, activity retries, execution, and polling.
 */
import { Effect, Layer, Schema } from "effect"
import { Activity, Workflow, WorkflowEngine } from "effect/unstable/workflow"

export class PaymentDeclined extends Schema.TaggedErrorClass<PaymentDeclined>()("PaymentDeclined", {
  message: Schema.String
}) {}

export class ShipmentUnavailable extends Schema.TaggedErrorClass<ShipmentUnavailable>()("ShipmentUnavailable", {
  message: Schema.String
}) {}

export const OrderPayload = Schema.Struct({
  orderId: Schema.String,
  amountCents: Schema.Int,
  shippingAddress: Schema.String
})

export type OrderPayload = Schema.Schema.Type<typeof OrderPayload>

export const OrderResult = Schema.Struct({
  orderId: Schema.String,
  paymentTransactionId: Schema.String,
  shipmentTrackingId: Schema.String
})

export type OrderResult = Schema.Schema.Type<typeof OrderResult>

export const OrderWorkflowError = Schema.Union([
  PaymentDeclined,
  ShipmentUnavailable
])

declare const paymentGateway: {
  readonly charge: (input: {
    readonly orderId: string
    readonly amountCents: number
    readonly idempotencyKey: string
  }) => Effect.Effect<
    {
      readonly transactionId: string
    },
    PaymentDeclined
  >
}

declare const shippingGateway: {
  readonly createLabel: (input: {
    readonly orderId: string
    readonly shippingAddress: string
    readonly paymentTransactionId: string
    readonly idempotencyKey: string
  }) => Effect.Effect<
    {
      readonly trackingId: string
    },
    ShipmentUnavailable
  >
}

// Activities are defined with `Activity.make`, and `execute` is an Effect value
// (not a function handler).
const chargePayment = (payload: OrderPayload) =>
  Activity.make({
    name: "OrderProcessing/chargePayment",
    success: Schema.Struct({ transactionId: Schema.String }),
    error: PaymentDeclined,
    execute: Effect.gen(function*() {
      const idempotencyKey = yield* Activity.idempotencyKey("charge-payment")
      return yield* paymentGateway.charge({
        orderId: payload.orderId,
        amountCents: payload.amountCents,
        idempotencyKey
      })
    })
  })

const createShipment = (payload: OrderPayload, paymentTransactionId: string) =>
  Activity.make({
    name: "OrderProcessing/createShipment",
    success: Schema.Struct({ trackingId: Schema.String }),
    error: ShipmentUnavailable,
    execute: Effect.gen(function*() {
      const idempotencyKey = yield* Activity.idempotencyKey("create-shipment")
      return yield* shippingGateway.createLabel({
        orderId: payload.orderId,
        shippingAddress: payload.shippingAddress,
        paymentTransactionId,
        idempotencyKey
      })
    })
  })

export const OrderProcessingWorkflow = Workflow.make({
  name: "OrderProcessingWorkflow",
  payload: OrderPayload,
  success: OrderResult,
  error: OrderWorkflowError,
  // This must be deterministic so repeated submissions deduplicate correctly.
  idempotencyKey: ({ orderId }) => orderId
})

export const OrderProcessingWorkflowLayer = OrderProcessingWorkflow.toLayer(
  Effect.fnUntraced(function*(payload) {
    // Retry the payment activity up to three times.
    const payment = yield* chargePayment(payload).asEffect().pipe(
      Activity.retry({ times: 3 })
    )

    // Activities are `Effect.Yieldable`, so you can yield them directly.
    const shipment = yield* createShipment(payload, payment.transactionId)

    return {
      orderId: payload.orderId,
      paymentTransactionId: payment.transactionId,
      shipmentTrackingId: shipment.trackingId
    }
  })
)

// Start execution without blocking. Keep the returned execution ID and poll it
// later from API handlers, workers, or other processes.
export const startOrderProcessing = Effect.fnUntraced(function*(payload: OrderPayload) {
  const executionId = yield* OrderProcessingWorkflow.execute(payload, {
    discard: true
  })
  const currentStatus = yield* OrderProcessingWorkflow.poll(executionId)
  return {
    executionId,
    currentStatus
  }
})

// Run and await completion in one call. This returns typed success or fails
// with a typed workflow error.
export const processOrder = Effect.fnUntraced(function*(payload: OrderPayload) {
  return yield* OrderProcessingWorkflow.execute(payload)
})

// Workflow programs require `WorkflowEngine` in context.
export const OrderProcessingWorkflowRuntime = OrderProcessingWorkflowLayer.pipe(
  Layer.provide(WorkflowEngine.layer)
)

// For distributed execution, replace `WorkflowEngine.layer` with
// `ClusterWorkflowEngine.layer` and provide its required sharding/storage
// services.
