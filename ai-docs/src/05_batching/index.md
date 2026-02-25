## Batching external requests

Effect can batch many request descriptions into fewer external calls. Define
request types with `Request`, implement a `RequestResolver` for batched
execution, and issue requests with `Effect.request` from regular Effect code.
