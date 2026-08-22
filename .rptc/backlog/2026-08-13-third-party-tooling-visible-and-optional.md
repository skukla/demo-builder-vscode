# Make third-party AI tooling visible, optional, and coherently gated

> ## ⏳ PARTIAL — step 1 (the enabling declaration) SHIPPED 2026-08-14
>
> `SKILL_MCP_TOOL_DEPENDENCIES` in `src/types/ai.ts` (beside
> `DEMO_BUILDER_ALWAYS_ON_SKILLS`, the one home for skill identity) maps skill
> filename → ai-defaults entry id. Classified by READING all six scraping skills,
> confirming the mention-count hypothesis: `scrape-reference-site` (instructs
> Playwright in its workflow B), `connect-authenticated-site` (entirely the
> Playwright storageState flow) and `refine-visual-match` (declares itself
> Playwright-workflow-only) depend on `playwright`; `commerce-block-mapper`,
> `demo-data-injector` and `header-nav-footer` work on already-scraped material
> and depend on nothing. `tests/types/skillMcpToolDependencies.test.ts` holds the
> map against reality in BOTH directions — declared ids must exist in
> ai-defaults.json, and a template that starts (or stops) instructing Playwright
> fails the sweep until the map agrees. No `AI_CONTEXT_VERSION` bump: generated
> content is unchanged; only the declaration and its guards were added.
>
> **Step 2 SHIPPED 2026-08-14 on `feature/tiered-ai-refresh`** (with the ADR-013
> batch, sharing its v8 `AI_CONTEXT_VERSION` bump): `writeSkillFiles` gates the
> three Playwright skills on `resolveAvailableMcpToolIds` (entry applies AND
> package installed) and removes stale copies only on positive proof of
> ownership; the AI Capabilities modal flags edited/kept files.
> **NOT done**: steps 3–7 — the opt-out setting
> threaded through all four gate seams, the AI Capabilities modal saying why a
> skill is absent, the Chromium cache pre-check, real install progress, and
> re-enable-must-install.

## Provenance

Asked 2026-08-13, after researching what happens when a skill needs an MCP the user does not
have: "Shouldn't the extension notify and show progress concerning the installation of
something it requires? And shouldn't installing something third-party be optional — and if
they opt out, don't we need to know which skills are therefore disabled?"

Both instincts hold up. The second one turns out to rest on a relationship the codebase does
not currently declare anywhere.

## What already works — do not rebuild it

Researched before scoping, because most of this is handled:

- **Install** — `@playwright/mcp` and `@adobe-commerce/commerce-extensibility-tools` are
  installed automatically into the project's isolated `.demo-builder-mcp/`, gated by each
  entry's `requires` in `ai-defaults.json`.
- **Config** — `.mcp.json` gets the entry. Nothing for the user to wire up by hand.
- **Install failure is surfaced** — `installAiDefaultsMcpTools` returns a structured
  `{ success, error }` and the regenerate handler turns it into a user-facing message.
- **Going missing later is caught** — `detectMcpDrift` stats each declared arg path, so a
  deleted or half-installed package is found on dashboard open and gated to a visible heal.
- **A broken server is visible** — `mcpInspector` reports `error` / `timeout` with a
  diagnostic, rendered by the AI Capabilities modal.
- **The skill says how to recover** — `scrape-reference-site` tells the agent to run
  Regenerate AI Files if the package is missing, and specifically NOT `npm install` in the
  storefront.

## Gap 1 — the biggest download is the invisible one

*(2026-08-22 correction — measured, this gap is much narrower than written.)* The premise
was wrong: `@playwright/mcp` drives the machine's **installed Google Chrome by default**.
Verified on both shipped versions (0.0.75 and 0.0.79) by pointing
`PLAYWRIGHT_BROWSERS_PATH` at an empty directory — navigation and screenshots still work,
and the launched browser's UA major matches the installed Chrome exactly, while an
explicitly missing channel (`--browser chrome-canary`) fails loudly and immediately. So on
a machine with Chrome (the SE default), **no download ever happens**. The skill-file
warnings that repeated the download claim were corrected at AI_CONTEXT_VERSION v17.

What remains of this gap: a machine with NO Chrome installed. That case needs the one-time
~150 MB Chromium install (the server's `install-browser` subcommand), and the original
concerns apply to it — no pre-check, no progress, failure surfaces mid-scrape. Absent-Chrome
default behavior (clean error vs fallback) was NOT measurable on a Chrome-equipped machine
and is unverified.

~~`@playwright/mcp` is only the server. Playwright fetches a **~150 MB Chromium on first
USE**, not at install, into `~/Library/Caches/ms-playwright/`. … "Usually fine, fails
confusingly on a locked-down network" is the shape that costs an afternoon in front of a
customer.~~ *(superseded by the correction above)*

## Gap 2 — progress is a label, not progress

~~The regenerate path emits one step: `Installing AI tooling`~~ *(2026-08-14: the step now reads `Downloading AI tool packages` and names the packages — but it is still ONE opaque npm block with a guessed duration; the remaining gap below stands.)*
`installAiDefaultsMcpTools` takes no progress callback, so npm runs as one opaque block, and
the minute is a guess presented as fact.

## Gap 3 — there is no opt-out, and adding one needs a link that does not exist

No setting governs third-party installs today; the gate is purely project composition.

**The blocker is not the toggle.** `ai-defaults.json` declares which PACKAGES a project
needs. `DEMO_BUILDER_ALWAYS_ON_SKILLS` declares which SKILLS get written. **Nothing connects
them.** The relationship lives only as prose inside skill bodies.

So "if they opt out, which skills are disabled?" has no machine-readable answer today. That
link must be declared before any gating can be correct — and once declared, the AI
Capabilities modal can say WHY something is absent instead of silently omitting it.

**And it is not all-or-nothing.** Measured by mentions across the six EDS scraping skills:

| Skill | Playwright mentions | Verdict |
|---|---|---|
| `connect-authenticated-site` | 13 | drives it |
| `scrape-reference-site` | 7 | drives it |
| `refine-visual-match` | 4 | drives it |
| `commerce-block-mapper` | 0 | works on already-scraped material |
| `demo-data-injector` | 0 | same |
| `header-nav-footer` | 0 | same |

Disabling all six would remove working capability; disabling none would leave three skills
instructing an agent to use a tool that is not there. Getting this wrong in either direction
is its own defect, and mention-counting is a starting hypothesis — each of the six needs
reading before it is classified.

## The state to avoid

**A skill that tells an agent to use a tool that is not installed is worse than no skill.**
The agent tries, fails, and improvises. Any opt-out must remove the skills with the package,
atomically, or it has made things worse.

## Execution plan

1. **Declare the skill→tool dependency.** Add it where the skills are declared, so a skill
   can name the ai-defaults `id` it requires. This is the enabling step; everything else
   depends on it. Classify the six scraping skills by READING them, not by counting mentions.
2. **Gate skill writing on it.** `skillsWriter` already writes conditionally; extend the
   condition from "does the project qualify" to "does it qualify AND is the tool available".
3. **Add the opt-out setting**, threaded through all four gate seams per
   `ai-context-authoring` — change all or none. Default ON: this is an escape hatch for
   restricted environments, not a new decision to put in front of every user.
4. **Say what is disabled and why** in the AI Capabilities modal. A missing tool with a
   stated reason is a different user experience from an absence.
5. **Pre-check the Chromium binary** — a cheap existence check on the cache dir, surfaced the
   way a missing package already is. Do not download it eagerly; knowing is the win.
6. **Give the install real progress**, or stop claiming a duration it cannot know.
7. **Re-enabling must install.** Turning the setting back on has to restore the package AND
   the skills, or the opt-out is one-way.

## Constraints

- The four gate seams (`mcpConfigWriter.buildMcpConfig`,
  `aiDefaultsInstaller.installAiDefaultsMcpTools`, `componentInstallationOrchestrator`,
  `aiHandlers.handleRegenerateAiFiles`) change all or none.
- Any change to generated content needs an `AI_CONTEXT_VERSION` bump, which re-prompts every
  existing project — batch this with other bundle changes rather than shipping alone.
- Do not eagerly download Chromium to make the check easy. The point is to know, not to spend
  someone's bandwidth on their behalf.

## Related

Shares machinery with
[`2026-08-13-tier-the-ai-bundle-refresh.md`](2026-08-13-tier-the-ai-bundle-refresh.md) — that
item makes the freshness check watch project COMPOSITION as a second axis; an opt-out is a
third input to the same gate. **Do the composition axis first**: this item's step 2 needs a
check that already knows how to compare "what applies" against "what is installed."

## Kickoff prompt

> Read `.rptc/backlog/2026-08-13-third-party-tooling-visible-and-optional.md`. Start with step
> 1 — declare which ai-defaults tool each generated skill requires, reading the six EDS
> scraping skills to classify them rather than trusting the mention counts in the item. That
> link does not exist today and everything else depends on it. Do not add the opt-out setting
> before a skill can be gated on it, or you ship skills that tell an agent to use a tool that
> is not there.
