## Testing Effect programs

Use `@effect/vitest` to test Effect programs with the same runtime semantics as
your app code. Use `it.effect` for tests that use test services (for example,
`TestClock`), use `it.live` when you need real runtime behavior, and use
`layer(...)` / `it.layer(...)` to share service layers across tests.
