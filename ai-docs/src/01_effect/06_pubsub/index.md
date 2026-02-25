## Broadcasting messages with PubSub

Use `PubSub` when you need one producer to fan out messages to many consumers.
Each subscriber receives its own copy of each message and manages its own
consumption pace.

Choose a strategy based on your delivery guarantees:

- `PubSub.bounded` applies backpressure when full.
- `PubSub.dropping` drops new messages when full.
- `PubSub.sliding` keeps new messages and evicts old ones when full.

Use replay (`{ replay: n }`) when late subscribers should receive a recent
window of events.
