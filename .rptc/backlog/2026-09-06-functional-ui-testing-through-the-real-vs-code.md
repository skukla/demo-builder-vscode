---
id: PL-46
kind: question
area: platform
needs: []
value: high
status: backlog
parent: PL-11
---

# Functional testing that drives the real VS Code, and where to stop

Asked 2026-09-06: can we automate creating a project by clicking through the UI, catching
errors and checking layout and styling?

Answer: yes, and three of the four layers already exist. This item is the decision about
the fourth, because the obvious version of it — click the wizard, make a project — creates
REAL Adobe Console projects, GitHub repositories and DA.live sites, which
[the repo's fifth non-negotiable](../../CLAUDE.md) forbids doing speculatively.

## What already exists

| Layer | Instrument | State |
|---|---|---|
| Component behaviour | `@testing-library/react` | heavily used; hardened all week by PL-22 |
| Decision coverage | Stryker mutation testing | PL-22; 89% of files at zero open gaps |
| Layout and styling | `webview-visual-baseline` | built, proven, gated ADR-018 and PL-21 |
| **Driving the real UI** | **nothing** | **the gap this item is about** |

**The styling half is already better than the usual answer.** `webview-visual-baseline`
fingerprints every element's computed styles across all eight surfaces — structural path
plus 23 properties, compared by exact string equality. No pixel tolerance, no font drift,
no screenshot flake, and it catches cascade and specificity changes, which is what CSS
breakage in this codebase actually is. Anyone proposing screenshot diffing should read it
first. What it does not do is prove the app WORKS; only that styling did not move.

## The gap, and the three standard ways to close it

**`@vscode/test-electron` — already a dependency (`^2.5.2`) and NEVER INVOKED.** No script
runs it; it appears only in `package.json`, an ADR, a README and an archived plan. It
launches a real VS Code with the extension loaded and asserts inside the extension host:
commands registered, activation completed, state persisted. Its limit is real — webviews
are isolated frames, so it cannot reach the React UI without help.

**`vscode-extension-tester` (Red Hat, Selenium) — the recommendation.** PURPOSE-BUILT for
VS Code extensions: it already understands the activity bar, side bar, notifications,
editors, the command palette and webview contents, and it manages downloading and launching
matching VS Code versions. Mature and widely used for this exact job.

**Playwright attached over the Electron debugging port.** VS Code is Electron, so Playwright
can attach and reach every frame, with better tooling — auto-waiting, trace viewer, real
debugging. But it knows nothing about VS Code: finding the right frame, knowing when the
window is ready, and driving editor chrome are all yours to write. And it is NOT VERIFIED
HERE — nobody has attached it to this extension.

**The first draft of this item got that comparison wrong** (2026-09-06), rating the two on
tooling quality and letting the unproven option read as the sophisticated choice. The right
axis is FIT: a tool that understands the application beats a better general-purpose tool
that does not, especially for a codebase one person maintains. Playwright's advantages —
trace viewer, auto-waiting — pay off across many tests; the setup cost dominates for a
handful of flows. This repo's instinct is the boring proven thing (Jest over newer runners,
esbuild over a bundler stack), and a bespoke CDP harness cuts against it.

Where Playwright genuinely wins is running the webviews standalone in a browser — which
`webview-visual-baseline` already does with its own harness, and which [[PL-47]] extends.
That is a different job from driving VS Code, and it is already solved.

## The constraint that shapes the design

Clicking the wizard through to a finished project creates real cloud resources. The
alternative of running against live cloud with teardown is slow, flaky, costs money and is
one failed cleanup away from orphaned resources in a real Adobe org.

**So: drive the real UI, fake the cloud boundary — not the other way round.** ADR-015 already
requires dependencies to arrive as parameters rather than be reached for, so the seams to
inject fake Adobe/GitHub/DA.live clients exist. The wizard, the handlers, the state writes
and the rendering all run for real; only the network edge is replaced. That keeps the test
honest about everything this repo actually owns.

## Recommended first step — NOT the click-through

Turn on `@vscode/test-electron` for ACTIVATION alone.

It is installed, unused, and activation is exactly where 2026-09-05 found the worst of it:
541 lines of `extension.ts` that no test had ever entered (it aborted at line 318 because
the workspace-trust flag was never set), and a `deactivate()` that threw on its first line
past four guards written for that very case. A test that launches VS Code, activates, and
asserts that commands registered and no error surfaced is roughly a day and covers the
riskiest path in the product.

Add UI driving on top only once that has earned its place.

## EXTENDING TO MORE SURFACES — attempted 2026-09-08, STOPPED deliberately

Four iterations in, each fix breaking the previous one. Recorded rather than
shipped, because the traps below all produce a PASSING test that measures the
wrong thing, which is worse than no test.

**THE SHIPPED SIDEBAR TEST IS ORDER-DEPENDENT, and its green run was luck.** With
a webview EDITOR also open it reads that editor's frame instead: on 2026-09-08 it
reported the wizard's 62 words while claiming to test the sidebar. It passes today
because it happens to run when no editor webview is open. That is a real
limitation of what is currently on develop, not a hypothetical.

**Trap 1 — the frame is chosen by position, not by focus.** `new WebView()` binds
to the FIRST webview frame in the document, not the active editor. Three cases
"passed" while two of them read the wizard. The only reason it was caught is that
each case PRINTS what it read; an assertion on "some text" would have stayed green
forever. Any multi-surface suite must close every editor BEFORE opening the one
under test.

**Trap 2 — `closeAllEditors()` throws** "no such element" in VS Code 1.136. The
command `View: Close All Editors` works and is a real user action anyway.

**Trap 3 — reading a frame traps the KEYBOARD.** `switchBack()` moves the driver,
not the focus, so the next `executeCommand` fails with "element not interactable",
an error naming the palette input and saying nothing about frames. Switching to
default content and sending Escape fixes it in isolation but did not survive being
combined with traps 1 and 2 in one run.

**Measured along the way, and worth keeping:**

- The wizard DOES render real content: `SETUP PROGRESS / Demo Setup /
  Prerequisites / Build Your Project / Final Review`.
- It first shows "Loading Project Creation Wizard…" — so "assert some readable
  text" passes on a SPINNER. A content check has to wait past the loading state,
  which the shipped sidebar test does not do.
- `demoBuilder.showDataInstaller` does open a "Data Installer" editor.
- `demoBuilder.openAi` opens NO webview. It is a prompts picker and does not
  belong in a surface census.
- A "Projects" editor is already open once the window settles, so no surface is
  ever the only webview by default.

**What this suggests for the next attempt:** one surface per VS Code launch, or a
helper that closes everything and verifies exactly one webview frame exists before
reading. The sequencing is the work; the approach is sound.

## WHERE THIS IS GOING — the owner's framing, 2026-09-08

Recorded because it changes the shape of the item rather than merely motivating it.

**The practice he wants:** before a release reaches the team, run targeted
workflows through BOTH surfaces — this UI mechanism, and *the identical flow* for
an agent driving the MCP tools. A set of workflows, automated, run as a release
gate. The immediate occasion is 700+ commits waiting to go out.

**Why that is a design constraint and not a nice-to-have.** This repo already
names the two surfaces — the human surface is the buttons, the agent surface is
the MCP tools, and both dispatch into the same handlers. `ai-coverage-scan` exists
because the gap between them is real and measured. A workflow suite that only
drives the UI proves half of that, and the half it proves is the half that already
has the most coverage.

So a journey should be defined ONCE and be runnable through either surface. Not
built yet, and deliberately not abstracted early — the first journeys are being
written concretely so the shared shape is discovered rather than guessed. But
nothing here should assume a UI-only future, and a journey that can only be
expressed as clicks is a journey the agent half cannot check.

**What this makes of [[PL-46]]:** the UI half of a paired release gate, with the
MCP half its sibling. The click-through is not the destination; a workflow set
that runs both ways is.

## ANSWERED BY THE OWNER, 2026-09-08

**The goal, in his words: "achieve as close to automated user testing of the
extension as possible."** That is the scope. Everything below is a step toward it,
not a substitute for it — and an attempt to reduce this item to "do the webviews
render content" was corrected on the spot. That is one thing the suite must catch,
not the reason it exists.

**What prompted it:** testing project creation by hand and hitting a React
component bug in a webview he did not expect. A surface that mounts and shows
nothing is the shape to guard against, and it is invisible to every check this
repo had — the visual harness asserts mounting for the DASHBOARD only, and on
2026-09-08 the sidebar rendered eleven elements and no text with nothing flagging
it.

Answers to the three questions:

1. **Worth having, yes** — and the reason is broader than catching integration
   breaks. It never will catch a real Adobe or GitHub break; that stays with
   `mcp-live-probe` and the live journeys. Its job is the extension's own
   behaviour under a real user's actions.
2. **No objection to `vscode-extension-tester`.** The Playwright alternative stays
   recorded as an unproven option, not a live one.
3. **Yes, the activation step happens on its own merits**, regardless of how far
   the UI driving goes.

## The question for the owner

1. Is a functional suite that stubs the cloud boundary worth having, given it will never
   catch a real Adobe/GitHub integration break? (The `mcp-live-probe` skill and the live
   journeys are what cover that, and they need a human.)
2. Any reason NOT to use `vscode-extension-tester`? It is the recommendation above; the
   Playwright alternative is recorded for completeness and would need proving first.
3. Should the activation step happen on its own merits regardless of the answer to 1 and 2?

## Its sibling

[[PL-47]] deepens the instrument that already exists — accessibility, theme variants and
widths against the standalone harness. The two are complements, not alternatives: PL-47
cannot prove a surface OPENS or that the extension sent the right payload, and this item
cannot cheaply reach the many states a fixture can express. The strongest argument for
having both is that a functional test is the only thing that could verify PL-47's fixtures
still match what the extension really sends.

Do PL-47 first. It is cheaper, it closes a stated-but-unenforced standard, and it does not
need this decision resolved.

## Shipped so far

- nothing; this is the decision, not the work.
- 2026-09-08  OWNER ANSWERED 2026-09-08. Goal stated verbatim: 'achieve as close to automated user testing of the extension as possible' — that is the scope, and an attempt to narrow this item to 'do the webviews render content' was corrected. The webview bug that prompted it (a React component fault hit by hand during project creation) is ONE thing the suite must catch, not the reason it exists. (1) Worth having, yes — its job is the extension's own behaviour under real user actions, not integration breaks, which stay with mcp-live-probe and the live journeys. (2) No objection to vscode-extension-tester; Playwright stays an unproven recorded alternative. (3) YES to the activation step on its own merits, regardless of how far UI driving goes. Next: the activation step with @vscode/test-electron.
- 2026-09-08  STEP ONE SHIPPED 2026-09-08: npm run test:electron launches a real VS Code, activates the extension and asserts a trusted workspace, activation without throwing, every manifest command actually registered, and the sidebar view present. First green run: trusted, 20 commands, 1 view. This enters 864 lines of extension.ts that no test had ever reached — it returns at line 318 on an untrusted workspace, which is why the trust assertion is the control rather than a formality. Zero new frameworks (run() is the whole --extensionTestsPath contract; no mocha). Three obstacles recorded in the files: @vscode/test-electron 2.5.2 cannot launch VS Code 1.110+ because the macOS binary was renamed Electron -> Code (upgraded to 3.1.0, whose changelog names the exact ENOENT); VS Code refuses to start when its user-data path exceeds ~103 chars because a unix socket lives there, so a short /tmp --user-data-dir is required; and the run reported resetAll/resetAiOnboarding as unregistered, which is NOT a bug — --extensionTestsPath means Test mode, not Development, and both are guarded on Development. Filter reads the manifest's own '(Dev Only)' title convention. NEXT: UI driving with vscode-extension-tester, per the owner's answer.
- 2026-09-08  RUNG TWO SHIPPED 2026-09-08: npm run test:ui drives the real VS Code UI with vscode-extension-tester — clicks the Demo Builder activity-bar icon, switches into the sidebar's webview iframe, and asserts readable text. First green run rendered 8 words (AI, Chat, Prompts, Utilities, Tools, Help, Settings, Logs). It counts WORDS not elements: a spinner is elements, a failed render is elements, and readable text is what separates loaded from loading-forever — the exact fault that prompted this item. Trap recorded: use WebviewView, NOT WebView; the latter is for editor webviews and fails against a sidebar with 'Unable to locate element: .editor-instance', which reads like a broken test rather than the wrong page object. COST: 133 packages including Selenium and a downloaded ChromeDriver, against 45 devDependencies before. Kept as a SEPARATE tier — npm run gate does not run it and neither does CI, deliberately, until it has proven stable. HONEST LIMIT: a blank render fails via the 60s wait timing out, which is structural and has not been empirically triggered by breaking a surface on purpose.
- 2026-09-08  OWNER'S DESTINATION, 2026-09-08: before a release reaches the team, run targeted workflows through BOTH surfaces — this UI mechanism AND the identical flow for an agent driving the MCP tools — as an automated release gate. Occasion: 700+ commits waiting. That makes PL-46 the UI HALF of a paired gate rather than a UI-testing item: a journey should be defined once and runnable either way, and a journey expressible only as clicks is one the agent half cannot check. Not abstracting early — the first journeys are concrete so the shared shape is discovered rather than guessed — but nothing should assume a UI-only future. The repo already names the two surfaces and ai-coverage-scan already measures the gap between them.
- 2026-09-08  EXTENSION TO MORE SURFACES ATTEMPTED AND STOPPED 2026-09-08, four iterations in, each fix breaking the last. Nothing shipped — the traps all produce a PASSING test that reads the wrong surface, which is worse than no test. KEY FINDING: the sidebar test already on develop is ORDER-DEPENDENT and its green run was luck; with a webview editor also open it reads that editor's frame, and it reported the wizard's 62 words while claiming to test the sidebar. Traps: (1) new WebView() binds to the FIRST webview frame, not the active editor — close all editors before opening the one under test; (2) closeAllEditors() throws 'no such element' in VS Code 1.136, the View: Close All Editors command works; (3) reading a frame traps the KEYBOARD, so the next executeCommand fails 'element not interactable' — switchBack moves the driver, not the focus. MEASURED: the wizard renders SETUP PROGRESS / Demo Setup / Prerequisites / Build Your Project / Final Review, but shows 'Loading Project Creation Wizard...' first, so an 'assert some text' check passes on a SPINNER — the shipped sidebar test does not wait past loading. showDataInstaller opens a real editor; openAi opens NO webview (prompts picker); a Projects editor is always already open. NEXT: one surface per launch, or a helper that verifies exactly one webview frame exists before reading.
- 2026-09-08  PARKED 2026-09-08 after a four-provenance research pass, written up at .rptc/research/testing-a-webview-heavy-extension/research.md. THE HEADLINE FINDING CHANGES THE TOOL CHOICE: nobody drives webview content with vscode-extension-tester by choice any more. GitLens, Cline and Salesforce DX all use Playwright over Electron; every ExTester-on-webview suite read carries a hand-written stabilisation layer for one specific race (Azure Logic Apps: 44 fixed sleeps in one 1,567-line file; OpenShift Toolkit deliberately sleeps because a tight poll STARVES the webview's own JS thread; Continue's GUI suite is describe.skip'd). GitLens' Playwright webview specs contain zero sleeps. Magnitude: ~29,400 package.jsons use @vscode/test-electron against 382 for vscode-extension-tester. THE MAJORITY PATTERN IS CHEAPER THAN EITHER: extension host in a real VS Code, webview UI separately in jsdom, no browser driver on the webview at all — GitHub Pull Requests does it with a ~90-line fake acquireVsCodeApi plus RTL, which is the closest cheap match to this repo. Microsoft is SILENT on webview testing (confirmed with controls: 95 doc files mention webviews, zero mention both webviews and a test runner) but tests its own over postMessage from the extension host, forwarding window.onerror back through the channel so a webview-side exception fails instead of timing out. THE CLOUD BOUNDARY IS SOLVABLE FROM OUTSIDE THE PROCESS: VS Code's extension host already routes through an env-var proxy (http.proxySupport defaults to 'override'), so HTTP_PROXY redirects everything with no hook inside the extension — but most record-replay proxies FORWARD unmatched requests to the real server by default, so unmatched must be killed and egress blocked. CodeQL ships an in-product mock GitHub server with record/replay scenarios checked in; that is the closest published analogue. THE PAIRED GATE HAS A NAME: the four-layer acceptance model (specification -> DSL -> protocol driver -> system), and the MCP Inspector's --cli gives the agent half distinct exit codes. Nobody has published the pairing as a release gate; the one team that hit it publicly built a coverage MATRIX, which is closer to ai-coverage-scan than to scenarios.
- 2026-09-08  THREE KNOWN-WRONG THINGS FIXED BEFORE PARKING, 2026-09-08. (1) The order-dependence recorded above was diagnosed wrong. It is not "binds to the FIRST webview frame": WebviewView.getViewToSwitchTo() collects every webview iframe and keeps the one that best fits ITS OWN rectangle, and constructed bare that rectangle defaults to the whole workbench (locators.Workbench.constructor), so the LARGEST webview anywhere wins. The fix is one argument — new WebviewView(new SideBarView()) — which scopes the rectangle to the sidebar. There is no way to select a webview by name in this library; a maintainer says so directly and the feature request for it was closed by the geometry PR without being built. (2) tests/electron/runTest.js claimed --disable-workspace-trust was load-bearing. It is not: @vscode/test-electron passes it on EVERY launch unconditionally (node_modules/@vscode/test-electron/out/runTest.js:64), so our copy changed nothing and the comment was a false explanation of why the suite passes. Flag removed, correction written in its place. The trust assertion inside the suite is still a real control. (3) The tester was 8.24.0, not 8.26 — the lockfile resolved a ^8.24.0 range. 8.24.0's newest locator set was 1.129.0, and VS Code 1.134 renamed the editor tab close button, which is the whole of the closeAllEditors breakage; 8.24.0 also made switchToFrame return SILENTLY when it found no frame. Upgraded to 8.26.0 (ships a 1.134.0 set) and pinned --code_version 1.136.1 in the test:ui script, with the reason written into the test file so the pin moves deliberately. VERIFIED: npm run test:ui green, reading the sidebar's own 8 words rather than the wizard's 62. STILL UNRESOLVED UPSTREAM and the largest risk here: this extension sets retainContextWhenHidden, which keeps hidden webview iframes in the DOM where they remain candidates for that geometric selection. Issue #1890 is exactly that configuration, has a reproducer, zero maintainer replies, and was auto-closed by a stale bot. The 8.25/8.26 fix changed detection and polling, NOT the geometry ranking, so it is not known to help.
