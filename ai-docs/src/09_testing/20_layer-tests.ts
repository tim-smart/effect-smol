/**
 * @title Testing services with shared layers
 *
 * Use `layer(...)` to share expensive setup across tests, and `it.layer(...)`
 * to compose additional test layers for nested suites.
 */
import { assert, describe, layer } from "@effect/vitest"
import { Effect, Layer, Ref, ServiceMap } from "effect"

type Todo = {
  readonly id: number
  readonly title: string
}

class TodoRepo extends ServiceMap.Service<TodoRepo, {
  readonly create: (title: string) => Effect.Effect<Todo>
  readonly list: Effect.Effect<ReadonlyArray<Todo>>
}>()("TodoRepo") {}

const TestTodoRepo = Layer.effect(TodoRepo)(
  Effect.gen(function*() {
    const store = yield* Ref.make<Array<Todo>>([])

    const create = Effect.fn("TodoRepo.create")(function*(title: string) {
      const todos = yield* Ref.get(store)
      const todo = { id: todos.length + 1, title }
      yield* Ref.set(store, [...todos, todo])
      return todo
    })

    const list = Ref.get(store)

    return TodoRepo.of({
      create,
      list
    })
  })
)

class TodoService extends ServiceMap.Service<TodoService, {
  readonly addAndCount: (title: string) => Effect.Effect<number>
  readonly titles: Effect.Effect<ReadonlyArray<string>>
}>()("TodoService") {
  static readonly layer = Layer.effect(TodoService)(
    Effect.gen(function*() {
      const repo = yield* TodoRepo

      const addAndCount = Effect.fn("TodoService.addAndCount")(function*(title: string) {
        yield* repo.create(title)
        const todos = yield* repo.list
        return todos.length
      })

      const titles = repo.list.pipe(
        Effect.map((todos) => todos.map((todo) => todo.title))
      )

      return TodoService.of({
        addAndCount,
        titles
      })
    })
  )
}

class CurrentUser extends ServiceMap.Service<CurrentUser, {
  readonly id: string
}>()("CurrentUser") {
  static readonly Test = Layer.succeed(CurrentUser)({ id: "docs-bot" })
}

class TodoAuditService extends ServiceMap.Service<TodoAuditService, {
  readonly createOwned: (title: string) => Effect.Effect<string>
}>()("TodoAuditService") {
  static readonly layer = Layer.effect(TodoAuditService)(
    Effect.gen(function*() {
      const user = yield* CurrentUser
      const todos = yield* TodoService

      const createOwned = Effect.fn("TodoAuditService.createOwned")(function*(title: string) {
        const count = yield* todos.addAndCount(`${user.id}:${title}`)
        return `${user.id}#${count}`
      })

      return TodoAuditService.of({
        createOwned
      })
    })
  )
}

describe("Layer-based testing", () => {
  // `layer(...)` creates one shared layer for the block and tears it down in
  // `afterAll`, so all tests inside can access the same service context.
  layer(TestTodoRepo)("TodoRepo shared layer", (it) => {
    it.effect("tests repository behavior", () =>
      Effect.gen(function*() {
        const repo = yield* TodoRepo
        const before = (yield* repo.list).length

        yield* repo.create("Write docs")

        const after = (yield* repo.list).length
        assert.strictEqual(after, before + 1)
      }))

    // `it.layer(...)` composes extra layers for a nested group.
    it.layer(TodoService.layer)("TodoService layer", (it) => {
      it.effect("tests higher-level service logic", () =>
        Effect.gen(function*() {
          const service = yield* TodoService
          const count = yield* service.addAndCount("Review docs")
          const titles = yield* service.titles

          assert.isTrue(count >= 1)
          assert.isTrue(titles.some((title) => title.includes("Review docs")))
        }))

      // Nested `it.layer(...)` blocks let you add more dependencies only where
      // they are needed.
      it.layer(
        TodoAuditService.layer.pipe(
          Layer.provide(CurrentUser.Test)
        )
      )("TodoAuditService nested composition", (it) => {
        it.effect("tests user-scoped behavior", () =>
          Effect.gen(function*() {
            const audit = yield* TodoAuditService
            const token = yield* audit.createOwned("Publish release notes")

            assert.isTrue(token.startsWith("docs-bot#"))
          }))
      })
    })
  })
})
