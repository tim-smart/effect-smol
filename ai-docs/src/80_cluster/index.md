## Working with Cluster entities

The cluster modules let you model stateful services as entities and distribute
them across shards. You define each entity as a set of typed RPCs, implement
stateful handlers, then call those handlers through a generated client proxy.
For local development and tests, `SingleRunner` gives you a single-node sharding
runtime with the same entity model.
