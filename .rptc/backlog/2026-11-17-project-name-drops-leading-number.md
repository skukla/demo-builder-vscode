---
id: PL-100
kind: fix
area: platform
needs: []
value: low
status: backlog
---

# A project name that starts with a number loses it, and nothing says why

Filed 2026-11-17 from the beta.153 release walk (finding F201, U2.3 step 1). Owner: "Does our
folder convention not allow for numbers in the folder names?" Decided: after the release.

## What happens

Typing "1028 Scratch B" as the project name shows `Folder: scratch-b` under the field. The rule
(`normalizeIdentifierName`, `src/core/validation/normalizers.ts`) lowercases, turns spaces into
hyphens, and strips every character before the first letter, so a leading number goes. Numbers
elsewhere stay ("Scratch 1028" is `scratch-1028`). The SC sees the folder change but not why.

The rule came in with `b47324f18` ("Enforce letter-start for project/site names"). Its comment says
the name must start with a letter "for consistency and portability", because the same normalizer
names DA.live sites and other identifiers. Whether DA.live, GitHub or anything else actually needs
a letter first was not checked; GitHub repository names may start with a digit
(`REPO_NAME_PATTERN` in the same file allows it).

## Recommendation

1. Say it under the field when it happens: "Names start with a letter, so 1028 was left out."
2. Then find out whether any place the name goes really needs a letter first. If none does, keep
   the number; if one does, keep the rule and the line.

Changing the rule touches site and repository names, so step 2 is checked before anything changes.
