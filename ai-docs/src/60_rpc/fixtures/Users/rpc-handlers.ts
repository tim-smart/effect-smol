import { Effect, Layer } from "effect"
import { Users } from "../Users.ts"
import { UserRpcs } from "./rpc.ts"

export const UserRpcsLayerNoDeps = UserRpcs.toLayer(Effect.gen(function*() {
  // Access the Users service to implement the RPC handlers.
  const users = yield* Users

  // Return the RPC handlers using the UserRpcs.of constructor.
  return UserRpcs.of({
    "users.get": ({ id }) => users.findById(id)
  })
}))

// Export a production layer that pre-provides the dependencies of the RPC
// handlers. This means you don't need to do lots of Layer wiring when setting
// up the final rpc server layer.
//
// You could also export a test layer.
export const UserRpcsLayer = UserRpcsLayerNoDeps.pipe(
  Layer.provide(Users.layer)
)
