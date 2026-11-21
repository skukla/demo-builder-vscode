# Resolution of review toolbox-and-removed-credential

Date: 2026-11-21
Reviewer: isolated-reviewer
Model: opus
Scope: .pipeline.yaml, .rptc/plans/evaluation-mode/battery/prompts.json, .rptc/plans/evaluation-mode/battery/run.mjs, src/core/config/envVarKeys.ts, src/features/components/services/commerceSecretSweep.ts, src/features/components/services/declaredSecretStore.ts, tests/features/components/services/commerceSecretSweep.test.ts, tests/core/config/envVarKeys-removedCredentials.test.ts, tests/sop/toolbox-tools.test.ts, tests/sop/toolboxTools.ts

6 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | The 'does nothing at all without SecretStorage' test and its comment now describe behaviour the sweep no longer has: without a store the sweep still walks every project, drops removed credentials and saves. | PROPOSE FIX | Test renamed to say a live secret stays put without a store; its comments now say a removed credential is still dropped without one. |
| F2 | low | A doc block still describes the removed ACCS OAuth credential pair as a live, optional component field, now attached to ACCS_WEBSITE_CODE. | PROPOSE FIX | Deleted the stale doc block about the removed ACCS OAuth pair from envVarKeys.ts. |
| F3 | low | Deleting a project does not delete a removed credential still held in SecretStorage. | PROPOSE FIX | forgetProjectCommerceSecrets also deletes REMOVED_CREDENTIAL_ENV_KEYS; its test now expects them. |
| F4 | low | The t2-* prompts are now tier 3, so run.mjs never runs them, yet their why text still says they run under --tier2. | PROPOSE FIX | Corrected the eight why texts: tier 2 until 2026-11-21, then tier 3, never run unattended. |
| F5 | low | The stated meaning of tier 3 does not match the prompts marked tier 3. | PROPOSE FIX | run.mjs now states the real rule: tier 3 is any prompt whose tool is on neither the read-only allowlist nor the tier-2 write list. |
| F6 | low | yamlLine writes run unquoted and does not escape backslashes in about, while the guard test only rejects shell characters. | PROPOSE FIX | New test refuses , { } [ ] or space-# in run, and a quote or backslash in about. |
