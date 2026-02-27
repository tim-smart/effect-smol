/**
 * @title Working with child processes
 *
 * Build child-process workflows with typed Effects. This example shows how to
 * collect output, compose pipelines, and stream long-running command output.
 */
import { NodeServices } from "@effect/platform-node"
import { Console, Effect, Layer, Schema, ServiceMap, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

export class DevToolsError extends Schema.TaggedErrorClass<DevToolsError>()("DevToolsError", {
  cause: Schema.Defect
}) {}

export class DevTools extends ServiceMap.Service<DevTools, {
  readonly nodeVersion: Effect.Effect<string, DevToolsError, ChildProcessSpawner.ChildProcessSpawner>
  readonly changedTypeScriptFiles: (
    baseRef: string
  ) => Effect.Effect<ReadonlyArray<string>, DevToolsError, ChildProcessSpawner.ChildProcessSpawner>
  readonly recentCommitSubjects: Effect.Effect<
    ReadonlyArray<string>,
    DevToolsError,
    ChildProcessSpawner.ChildProcessSpawner
  >
  readonly runLintFix: Effect.Effect<void, DevToolsError, ChildProcessSpawner.ChildProcessSpawner>
}>()("docs/DevTools") {
  static readonly layer = Layer.effect(
    DevTools,
    Effect.gen(function*() {
      const nodeVersion = ChildProcess.string(
        ChildProcess.make("node", ["--version"])
      ).pipe(
        Effect.map((version) => version.trim()),
        Effect.mapError((cause) => new DevToolsError({ cause }))
      )

      const changedTypeScriptFiles = Effect.fnUntraced(function*(baseRef: string) {
        // `ChildProcess.lines` is a convenience helper for line-oriented command
        // output.
        const files = yield* ChildProcess.lines(
          ChildProcess.make("git", ["diff", "--name-only", `${baseRef}...HEAD`])
        ).pipe(
          Effect.mapError((cause) => new DevToolsError({ cause }))
        )

        return files.filter((file) => file.endsWith(".ts"))
      })

      // Build a pipeline from two command values. This runs:
      // `git log --pretty=format:%s -n 20 | head -n 5`
      const recentCommitSubjects = ChildProcess.lines(
        ChildProcess.make("git", ["log", "--pretty=format:%s", "-n", "20"]).pipe(
          ChildProcess.pipeTo(ChildProcess.make("head", ["-n", "5"]))
        )
      ).pipe(
        Effect.mapError((cause) => new DevToolsError({ cause }))
      )

      const runLintFix = Effect.scoped(
        Effect.fnUntraced(function*() {
          // Use `spawn` when you want the process handle and stream output while
          // the process is still running.
          const handle = yield* ChildProcess.spawn(
            ChildProcess.make("pnpm", ["lint-fix"], {
              env: { FORCE_COLOR: "1" },
              extendEnv: true
            })
          ).pipe(
            Effect.mapError((cause) => new DevToolsError({ cause }))
          )

          yield* handle.all.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.runForEach((line) => Console.log(`[lint-fix] ${line}`)),
            Effect.mapError((cause) => new DevToolsError({ cause }))
          )

          const exitCode = yield* handle.exitCode.pipe(
            Effect.mapError((cause) => new DevToolsError({ cause }))
          )

          if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
            return yield* Effect.fail(
              new DevToolsError({
                cause: new Error(`pnpm lint-fix failed with exit code ${exitCode}`)
              })
            )
          }
        })()
      )

      return DevTools.of({
        nodeVersion,
        changedTypeScriptFiles,
        recentCommitSubjects,
        runLintFix
      })
    })
  )
}

export const program = Effect.gen(function*() {
  const tools = yield* DevTools

  const version = yield* tools.nodeVersion
  yield* Console.log(`node=${version}`)

  const changed = yield* tools.changedTypeScriptFiles("main")
  yield* Console.log(`changed-ts-files=${changed.length}`)

  const commits = yield* tools.recentCommitSubjects
  for (const commit of commits) {
    yield* Console.log(`- ${commit}`)
  }

  yield* tools.runLintFix
}).pipe(
  // `ChildProcess` requires a platform implementation of
  // `ChildProcessSpawner`. In Node.js, `NodeServices.layer` provides it.
  Effect.provide([DevTools.layer, NodeServices.layer])
)
