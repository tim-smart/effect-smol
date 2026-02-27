import { LogRpcs } from "./Logs/rpc.ts"
import { UserRpcs } from "./Users/rpc.ts"

// Merge all the sub-groups of RPCs into a single group that can be provided to
// the RPC server.
//
// .merge can take multiple groups and merge them together, so you can have as
// many sub-groups as you like.
export class AllRpcs extends UserRpcs.merge(
  LogRpcs
) {}
