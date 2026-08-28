---
id: AI-1q
kind: feature
area: ai
parent: AI-1
needs: []
value: high
status: active
---

# Every tool and skill the modal promises gets a prompt that proves it

Asked by the owner 2026-08-27: *"run enough prompts such that every expected
tool and skill from the supported list of AI tools per project that we show in
the modal is properly represented."* The AI Capabilities modal promises a
surface per project shape; nothing verifies the promise tool by tool. The
mechanic already exists — `unprompted-baseline.json` (93 tools) is the ratchet,
and `toolPromptCoverage.test.ts` keeps it honest. This plan drives it to a
NAMED FLOOR, not to zero, because "represented" cannot mean the same thing for
a read and for `delete_adobe_project`.

## The four tiers

**Tier 1 — reads (~44 tools callable without force).** One prompt each, expected
tool declared, run live. A miss is not a failed prompt — it is a discoverability
finding about the tool. This tier is fully automatable overnight: draft from the
tool description + corpus, run, classify, keep. ~28 prompts to write beyond
today's 16.

**Tier 2 — writes safe on a scratch resource** (project-local: config, prompts,
pin/rename, datapack validation…). Needs a disposable scratch project and a
per-run allowlist extension — the battery's readonly allowlist currently makes
every write attempt INVALID by design. Build the scratch-project harness first;
until then these stay in the baseline.

**Tier 3 — writes that touch live cloud** (deploys, publishes, GitHub/Adobe/
DA.live create/delete). NEVER exercised unattended. Represented instead by
handler tests + descriptor/consent checks, and — only with the owner present —
supervised journey runs. These are the permanent floor, each named in the
baseline with its reason.

**Tier 4 — third-party servers** (Dropins 20, Playwright 24, App Builder MCP
11). Job-level coverage, not tool-level: we measure that OUR surface routes an
agent to them (a prompt whose correct route is `list_slots`; the site-scraping
skills that drive Playwright), not the internals of tools we do not ship.
Tool-per-tool prompts for generic browser primitives would measure Microsoft's
code, not ours.

## Skills are covered the same way

A skill is represented when a prompt exists whose correct route is THROUGH that
skill, and the transcript shows it loaded. Add `expectSkill` to the prompt
schema and a parallel skills baseline (14 Demo Builder + 6 storefront + 7
starter-kit). Open question: confirm headless `claude -p` runs load project
skills the same way interactive sessions do before trusting the measurement.

## The per-shape dimension

The modal's promise is per PROJECT SHAPE. Today's rig measures one shape
(bodea: EDS + ACCS). Headless, PaaS, and mesh-bearing shapes change which tools
apply — `filterStepsForStack`, the gates. Phase for later: scratch projects per
shape, cloud resources required, owner present.

## Done looks like

- `unprompted-baseline.json` reduced to tier-3 entries only, each with a
  stated reason — the baseline becomes documentation of the floor
- a skills baseline at zero for the current shape
- the battery runnable as a full-coverage sweep at release cuts

Filed 2026-08-27, folded into the overnight loop as its standing work queue:
tier 1 is tonight's task after the orientation prompts verify.

## Shipped so far

- 2026-08-27  Batch 2: 11 HIT, 3 AROUND across the Adobe/datapack/GitHub/block families. SHIPPED from it: list_workspaces stale-project 404 now answers a diagnosis (verified live against the real deleted project). RECORDED, not fixed: three native-competition datapoints — component-config lost to Glob+Read, block-source to ls, github-repos and repo-readiness to gh — the pattern is consistent: when the agent has local FS or an authed gh, our read tools lose to the native route and the answers were GOOD. That is tool-verdicts evidence about which reads earn their keep, not something to force. check_github_app's 401 was the expired DA.live session (environment, correctly reported by the tool). ENV facts for the morning: DA.live session expired; the selected Adobe Console project (Kukla Mesh Test) no longer exists; the kukla_adobe GitHub token is invalid; a DA.live sign-in prompt may be open in the window from the pre-hardening run.
- 2026-08-27  Tier 1 COMPLETE overnight: 44 battery prompts (was 12 at midnight), 45 of the 52 declared reads covered — every batch verdict HIT or a recorded finding. 7 reads deferred with reasons in tier1-queue.json. Baseline 93 -> 61. Loop ran 9 cycles: 3 tool fixes shipped and live-verified (get_settings unprefixed keys, list_workspaces stale-project diagnosis, plus the pre-sleep pair confirmed 3/3), 3 rig defects fixed (comma --only, SIBLING-TOOL and NATIVE-FILES diagnoses), 1 safety hole closed (allowlist had lost its read-only property — sign_in fired an interactive auth at the sleeping owner). Native-competition pattern recorded as tool-verdicts evidence.
- 2026-08-27  docs(backlog): overnight loop closed — tier 1 complete (`d0484ce85`)
- 2026-08-27  feat(battery): coverage batch 3 — 7/7 HIT, and the tier-1 queue is done (`f08a8535c`)
- 2026-08-27  fix(ai): a deleted Console project answers a diagnosis, not a bare 404 (`3b111bf58`)
- 2026-08-26  feat(battery): NATIVE-FILES diagnosis + coverage batch 2 (14 prompts) (`ecb8e23ef`)
- 2026-08-26  fix(battery): pay the coverage ratchet — baseline shrinks by the 11 tools batch 1 covered (`1574cbac4`)
- 2026-08-26  fix(ai): get_settings accepts the key a producer would actually type (`81ab1d07f`)
- 2026-08-26  fix(battery): unattended runs allow declared reads only — the allowlist had lost that property (`589161311`)
- 2026-08-26  docs(battery): AI-1q tier-1 queue — 30 forceless reads with no prompt (`513db71b1`)
- 2026-08-26  docs(backlog): AI-1q — every tool and skill the modal promises gets a prompt (`01cd5fe2e`)
- 2026-08-27  Native-competition verdicts executed. DELETED get_block_source (first deletion on the measured bar: zero corpus calls + lost its audition to ls + no differentiator over native reads). FIXED get_component_config — was returning .env and manifests VERBATIM, the exact leak stripManifestSecrets prevents one tool over; now masks SECRET_ENV_KEYS values, strips manifests, refuses unparseable JSON. KEPT list_github_repos (extension-auth fallback when gh absent) and check_repo_readiness (composite classification shared with 3 UI call sites; the gh route rebuilt it ad hoc — the drift the spine rules warn about). Surface: 106 -> 105 tools.
- 2026-08-27  feat(battery): the two DA.live prompts run once the owner re-authed — both HIT (`e435bf245`)
- 2026-08-27  docs(skills): tool-verdicts carries the deletion bar the first deletion set (`0b18cf590`)
- 2026-08-27  docs(backlog): native-competition verdicts logged (`3ee63a08d`)
- 2026-08-27  refactor(mcp): the first tool deleted on measured evidence, and the safe door locked (`0ccfb5263`)
- 2026-08-27  Skill-coverage work opened with the planned headless probe and immediately found the defect that reframes it: the fourteen Demo Builder skills were written as flat .claude/skills/<name>.md files, a layout Claude Code never registers as skills (measured live — every directory-format skill registered, zero flat files; positive control: the two global skills are directories). FIXED same-turn on the loop branch (32d62e8ad): <name>/SKILL.md layout across skillsWriter/home writer/inspector/health check, legacy flat files reconciled via ADR-013, AI_CONTEXT_VERSION 26->27 so the activation sweep migrates existing projects. Consequence for this item: skill-coverage measurement (expectSkill) is only meaningful AFTER a project carries v27 — deploying it to bodea needs F5 (supervised edge). Husk note: bodea's empty appbuilder-* dirs are AI-1o's documented removal residue, not a delivery failure.
- 2026-08-28  2026-08-27 loop pickup, staleness check: the 'expectSkill needs F5 first' claim is STALE — bodea is at aiContextVersion 27 with the directory-layout skills on disk (verified: 28 skill dirs, add-component/SKILL.md), migrated by the activation sweep during today's host reloads. Skills-coverage measurement is unattended-runnable now. Baseline re-verified at 59 tools; tier1-queue holds 5 deferred reads with standing reasons (select_* trio flagged as dishonest readOnlyHint — tool-verdicts evidence).
