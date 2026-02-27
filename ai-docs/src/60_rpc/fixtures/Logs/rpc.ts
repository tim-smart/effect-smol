import { Rpc, RpcGroup } from "effect/unstable/rpc"
import { LogEntry, LogLevelSchema } from "../domain/LogEntry.ts"

export class StreamLogs extends Rpc.make("logs.stream", {
  payload: {
    minimumLevel: LogLevelSchema
  },
  success: LogEntry,
  stream: true
}) {}

export class LogRpcs extends RpcGroup.make(
  StreamLogs
) {}
