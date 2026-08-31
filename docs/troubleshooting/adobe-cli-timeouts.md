# An Adobe CLI timeout is not proof of failure

## The symptom

The debug log contradicts itself: stdout shows the command succeeded, and a
timeout error is thrown anyway.

```
[DEBUG] Executing: aio console org list
[DEBUG] Command stdout: [{"id":"...","name":"..."}]
[ERROR] Command timed out after 5000ms
```

The user sees "Error Loading Organizations" while the operation actually worked.

## Why it happens

`aio` commands routinely take 8–10 seconds. Anything given a 5-second budget will
report failure on a call that succeeded — the CLI is slow, not broken.

## The two-part answer

**1. Use the right timeout bucket.** Timeouts live in
`@/core/utils/timeoutConfig` as `TIMEOUTS`, never as a literal:

| Bucket | For |
|---|---|
| `QUICK` (5s) | config reads, shell checks, quick validations |
| `NORMAL` (30s) | API calls, data loading — **every `aio` CLI call belongs here** |
| `LONG` (3min) | mesh deployment, installations, builds |
| `VERY_LONG` (5min) | large downloads, full npm installs |

**2. Check stdout before treating a timeout as a failure.** In the catch block,
look for the command's own success output:

```typescript
} catch (error) {
    const err = error as { stdout?: string };
    if (err.stdout?.trim().startsWith('[')) {
        return JSON.parse(err.stdout);   // it worked; we just stopped waiting
    }
    throw error;
}
```

Match on what the command actually prints — a JSON array for the `list` commands, a
specific phrase for the ones that print prose.

## Where this still applies

Five modules run `aio console org list` or `workspace list` today:
`diagnosticsChecks.ts`, `adobeEntityReads.ts`, `authenticationService.ts`,
`ensureOrgContext.ts`, and `onOpenChecks/orgContextCheck.ts`.

**They do not all handle it the same way**, so check the call site you are changing
rather than assuming the pattern is already there.

## What is NOT here any more

This guide used to lead with `aio console project select` and a `selectProject`
method on `authenticationService`. Both are gone — project and workspace selection
no longer runs a CLI mutation at all.

The extension deliberately stopped using the `aio` CLI's process-global org
selection in favour of per-operation targeting through `withOrgContext`
(`orgContextEnv.ts`), which is now the pattern across the Adobe-touching code rather
than an exception. An agent is blocked from re-introducing it: the
generated `.claude/settings.json` carries a PreToolUse guard against
`aio-configure-global`, `aio-app-use` and `aio-where`. An unwrapped path once
deployed a mesh into a deleted project for two days.

So if you are reading this because a *selection* timed out, the timeout is not your
problem — see the `adobe-org-context` skill.

## Related

- `adobe-org-context` skill — the canonical org/auth model
- [`../../src/commands/CLAUDE.md`](../../src/commands/CLAUDE.md) — the same rule
  stated where commands are written
