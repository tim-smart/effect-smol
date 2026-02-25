/**
 * @title Using Layer.launch as the application entry point
 *
 * Use `Layer.launch` when your app is mostly layer composition. This keeps the
 * process alive while the layer is running and shuts it down when interrupted.
 */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/unstable/http"
import { createServer } from "node:http"

// Build a tiny HTTP app with a health-check endpoint.
export const HealthRoutes = HttpRouter.add(
  "GET",
  "/health",
  Effect.succeed(HttpServerResponse.text("ok"))
)

// Turn the routes into a server layer and provide the Node HTTP server backend.
export const HttpServerLive = HttpRouter.serve(HealthRoutes).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

// `Layer.launch` converts the layer into a long-running Effect<never>.
export const main = Layer.launch(HttpServerLive)

// This entrypoint pattern works well when the whole app is represented as
// layers (for example: HTTP server + background workers).
main.pipe(NodeRuntime.runMain)
