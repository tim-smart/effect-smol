import { Rpc, RpcGroup } from "effect/unstable/rpc"
import { User, UserId } from "../domain/User.ts"
import { UserNotFound } from "../Users.ts"

export class GetUser extends Rpc.make("users.get", {
  payload: { id: UserId },
  success: User,
  error: UserNotFound
}) {}

export class UserRpcs extends RpcGroup.make(
  GetUser
) {}
