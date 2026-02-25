## Building type-safe RPC services

The `effect/unstable/rpc` modules let you define schema-validated remote
procedures, implement handlers in one place, and derive a typed client from the
same protocol definition. RPC handlers support both request-response (`Effect`)
and streaming (`Stream`) workflows.
