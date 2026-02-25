## Durable workflows

Durable workflows coordinate multi-step business processes with persisted state
and resumable execution. Define each step as an `Activity`, compose the steps in
a `Workflow`, and execute or poll by deterministic execution ID.

Running workflow code requires a `WorkflowEngine` service in context. For local
development, provide `WorkflowEngine.layer`; for distributed deployments,
provide `ClusterWorkflowEngine.layer` with its sharding and storage
dependencies.
