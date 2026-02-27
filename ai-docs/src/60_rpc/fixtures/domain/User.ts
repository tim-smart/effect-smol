import { Schema } from "effect"

// Use branded types to prevent mixing up different string types, even though
// they are all just strings at runtime.
export const UserId = Schema.NonEmptyString.pipe(
  Schema.brand("UserId")
)

// Also export the type
export type UserId = typeof UserId.Type

export class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String
}) {}
