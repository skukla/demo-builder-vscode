# DaLivePermissions log message has a chopped owner name

**Filed:** 2026-06-10
**Origin:** Live ADR-006 smoke test on `skukla/citisignal-b2b`. Reset logs printed:
  `[DaLiveConfig] Granting access to kukla@adobe.com for ukla/citisignal-b2b`
The owner is `skukla`, not `ukla` — first character lost. Cosmetic-only; the actual
access grant succeeded (DA.live confirmed the user had full access), so this is a
log-formatting bug, not a behavior bug.
**Status:** Ready — single-file, single-line fix; pick up any time.

## Provenance

Surfaced in the Step 5b smoke-test logs at timestamp `12:42:01.321`. The grant
itself worked correctly:

```
[DaLiveConfig] Granting access to kukla@adobe.com for ukla/citisignal-b2b
[DaLiveConfig] Getting org config for skukla
[DaLiveConfig] User kukla@adobe.com already has full access to citisignal-b2b
```

So `DaLiveConfig` reads the right org (`skukla`) at the API level — only the
log line corrupts the value before printing.

## Goal / scope

Find the string-slice or template-literal somewhere in `DaLivePermissions` /
`DaLiveConfig` that builds `for <owner>/<repo>` and drops the first character.
Likely candidate: a `substring(1)` or `slice(1)` that was meant for stripping a
leading `/` or `@`, applied unconditionally instead. Fix to use the value
verbatim and add a one-line test that the log line includes the full owner.

## Execution plan

1. `grep -rn "Granting access" src/features/eds/` to find the source.
2. Inspect the surrounding string interpolation.
3. Remove the off-by-one slice; verify against the smoke-test log message
   from the ADR-006 commit `5cfb5b68`.
4. Add one assertion in the existing DaLivePermissions test suite that the
   info-log line contains `skukla` exactly (not `ukla`).

## Constraints

- Don't refactor the surrounding code. This is a one-character bug;
  resist the urge to clean up the function it's in.
- The actual permission grant logic works correctly — do not touch it.

## Kickoff prompt

```
Fix the chopped owner name in DaLivePermissions log output (see
.rptc/backlog/2026-06-10-dalive-permission-log-typo.md).

Find the string-slice in src/features/eds/services/configurationService.ts
or daLiveOrgOperations.ts that builds the "Granting access to <user> for
<owner>/<repo>" log line and drops the first character of the owner. The
permission grant itself works — only the log line is wrong. Fix the slice,
add one assertion to the existing DaLivePermissions tests that the log
includes the full owner. Single commit, ~5 minutes.
```
