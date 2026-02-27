import { LogLevel, Schema } from "effect"

export const LogLevelSchema = Schema.Literals(LogLevel.values)

export class LogEntry extends Schema.Class<LogEntry>("LogEntry")({
  level: LogLevelSchema,
  message: Schema.String,
  timestamp: Schema.DateTimeUtcFromMillis
}) {}
