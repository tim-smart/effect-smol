## Running Effect programs

Use `NodeRuntime.runMain` for standalone Node.js entrypoints (or `BunRuntime.runMain` in Bun with the same API shape). Use `Layer.launch` when your application is primarily a composition of layers, such as an HTTP server and background workers.

Both patterns integrate with runtime signal handling (`SIGINT` / `SIGTERM`) so shutdown is graceful.
