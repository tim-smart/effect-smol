/**
 * @title Using ManagedRuntime with Hono
 *
 * Use a module-level `ManagedRuntime` to run Effect programs from framework
 * handlers while keeping your domain logic in services and Layers.
 */
import { Effect, Layer, ManagedRuntime, Ref, Schema, ServiceMap } from "effect"
import { Hono } from "hono"

class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.Number,
  title: Schema.String,
  completed: Schema.Boolean
}) {}

class CreateTodoPayload extends Schema.Class<CreateTodoPayload>("CreateTodoPayload")({
  title: Schema.String
}) {}

class TodoNotFound extends Schema.TaggedErrorClass<TodoNotFound>()("TodoNotFound", {
  id: Schema.Number
}) {}

export class TodoRepo extends ServiceMap.Service<TodoRepo, {
  getAll(): Effect.Effect<ReadonlyArray<Todo>>
  getById(id: number): Effect.Effect<Todo, TodoNotFound>
  create(payload: CreateTodoPayload): Effect.Effect<Todo>
}>()("app/TodoRepo") {
  static readonly layer = Layer.effect(
    TodoRepo,
    Effect.gen(function*() {
      const todos = yield* Ref.make(new Map<number, Todo>())
      const nextId = yield* Ref.make(1)

      const getAll = Effect.fn("TodoRepo.getAll")(function*() {
        const store = yield* Ref.get(todos)
        return Array.from(store.values())
      })

      const getById = Effect.fn("TodoRepo.getById")(function*(id: number) {
        const store = yield* Ref.get(todos)
        const todo = store.get(id)
        if (todo === undefined) {
          return yield* Effect.fail(new TodoNotFound({ id }))
        }
        return todo
      })

      const create = Effect.fn("TodoRepo.create")(function*(payload: CreateTodoPayload) {
        const id = yield* Ref.getAndUpdate(nextId, (current) => current + 1)
        const todo = new Todo({ id, title: payload.title, completed: false })
        yield* Ref.update(todos, (store) => new Map(store).set(id, todo))
        return todo
      })

      return TodoRepo.of({ getAll, getById, create })
    })
  )
}

// Build one runtime at module scope and reuse it in handlers.
export const runtime = ManagedRuntime.make(TodoRepo.layer)

export const app = new Hono()

app.get("/todos", async (context) => {
  const todos = await runtime.runPromise(
    TodoRepo.use((repo) => repo.getAll())
  )
  return context.json(todos)
})

app.get("/todos/:id", async (context) => {
  const id = Number(context.req.param("id"))
  if (!Number.isFinite(id)) {
    return context.json({ message: "Todo id must be a number" }, 400)
  }

  const todo = await runtime.runPromise(
    TodoRepo.use((repo) => repo.getById(id)).pipe(
      Effect.catchTag("TodoNotFound", () => Effect.succeed(null))
    )
  )

  if (todo === null) {
    return context.json({ message: "Todo not found" }, 404)
  }

  return context.json(todo)
})

const decodeCreateTodoPayload = Schema.decodeUnknownSync(CreateTodoPayload)

app.post("/todos", async (context) => {
  const body = await context.req.json()

  let payload: CreateTodoPayload
  try {
    payload = decodeCreateTodoPayload(body)
  } catch {
    return context.json({ message: "Invalid request body" }, 400)
  }

  const todo = await runtime.runPromise(
    TodoRepo.use((repo) => repo.create(payload))
  )

  return context.json(todo, 201)
})

// The same bridge pattern works for Express, Fastify, Koa, and other frameworks.
// Use `runtime.runSync` for synchronous edges or `runtime.runCallback` for
// callback-only APIs.

const shutdown = () => {
  void runtime.dispose()
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
