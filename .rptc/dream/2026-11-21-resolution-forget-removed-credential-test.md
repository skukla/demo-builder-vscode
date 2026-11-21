# Resolution of review forget-removed-credential-test

Date: 2026-11-21
Reviewer: isolated-reviewer
Model: opus
Scope: tests/features/components/services/declaredSecretStore.test.ts

1 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | The test builds its expected keys with the same expression as forgetProjectCommerceSecrets and only checks that the combined list is non-empty, so it would still pass if removed credentials stopped being deleted. | PROPOSE FIX | Added an assertion that the key for ACCS_OAUTH_CLIENT_SECRET, written out by name, is among the deleted keys. |
