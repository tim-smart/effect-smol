/**
 * @title Working with the Schedule module
 *
 * Build schedules from primitives, compose them, and use them with
 * `Effect.retry` and `Effect.repeat`.
 */
import { Console, Duration, Effect, Schedule, Schema } from "effect"

export class HttpError extends Schema.TaggedErrorClass<HttpError>()("HttpError", {
  message: Schema.String,
  status: Schema.Number,
  retryable: Schema.Boolean
}) {}

// Start with a few schedule constructors.
export const maxRetries = Schedule.recurs(5)
export const fixedPolling = Schedule.spaced("30 seconds")
export const exponentialBackoff = Schedule.exponential("200 millis")

// `Schedule.both` continues only while both schedules continue.
// It is useful for combining a delay pattern with a hard attempt cap.
export const retryBackoffWithLimit = Schedule.both(
  Schedule.exponential("250 millis"),
  Schedule.recurs(6)
)

// `Schedule.either` continues while either schedule continues.
// It is useful for fallback behavior (e.g. stop only when both are exhausted).
export const keepTryingUntilBothStop = Schedule.either(
  Schedule.spaced("2 seconds"),
  Schedule.recurs(3)
)

// Use `Schedule.while` to continue only for retryable failures.
// This lets non-retryable errors fail fast, even if attempts remain.
export const retryableOnly = Schedule.exponential("200 millis").pipe(
  Schedule.while(({ input }) =>
    Effect.succeed(
      input instanceof HttpError && input.retryable
    )
  )
)

// `tapInput` and `tapOutput` are useful for metrics and observability.
export const instrumentedRetrySchedule = retryableOnly.pipe(
  Schedule.tapInput((error) =>
    Console.log(
      error instanceof HttpError
        ? `Retrying after ${error.status}: ${error.message}`
        : "Retrying after unknown error"
    )
  ),
  Schedule.tapOutput((delay) => Console.log(`Next retry in ${Duration.toMillis(delay)}ms`))
)

// Production pattern: capped exponential backoff with jitter and max attempts.
// Delays start at 250ms, grow exponentially with jitter, and are capped at 10s.
export const productionRetrySchedule = Schedule.exponential("250 millis").pipe(
  Schedule.jittered,
  Schedule.modifyDelay((_, delay) => Effect.succeed(Duration.min(delay, Duration.seconds(10)))),
  Schedule.both(Schedule.recurs(7)),
  Schedule.while(({ input }) =>
    Effect.succeed(
      input instanceof HttpError && input.retryable
    )
  ),
  Schedule.tapOutput(([delay, attempt]) =>
    Console.log(
      `Attempt ${attempt + 1} failed, retrying in ${Duration.toMillis(delay)}ms`
    )
  )
)

export const fetchUserProfile = Effect.fn("fetchUserProfile")(
  function*(userId: string) {
    const status = Math.random() > 0.7
      ? 200
      : Math.random() > 0.3
      ? 503
      : 401

    if (status !== 200) {
      return yield* Effect.fail(
        new HttpError({
          message: `Request for ${userId} failed`,
          status,
          retryable: status >= 500
        })
      )
    }

    return {
      id: userId,
      name: "Ada Lovelace"
    } as const
  }
)

// Use the schedule with `Effect.retry` to retry failures.
export const loadUserWithRetry = fetchUserProfile("user-123").pipe(
  Effect.retry(productionRetrySchedule)
)

const pollQueueDepth = Effect.fn("pollQueueDepth")(function*() {
  const queueDepth = Math.floor(Math.random() * 20)
  yield* Console.log(`Queue depth: ${queueDepth}`)
  return queueDepth
})

const repeatPolicy = Schedule.spaced("15 seconds").pipe(
  Schedule.both(Schedule.recurs(4)),
  Schedule.tapOutput(([, attempt]) => Console.log(`Completed poll run ${attempt + 1}`))
)

// Use the schedule with `Effect.repeat` to repeat successful effects.
export const pollQueueDepthFiveTimes = Effect.repeat(
  pollQueueDepth(),
  repeatPolicy
)
