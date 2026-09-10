# Testing a webview-heavy VS Code extension

Run 2026-09-08 at the owner's direction, after an attempt to extend the UI test
tier went four iterations deep with each fix breaking the previous one. The
question behind it was his: *"Have you done any research as to how to reliably
test this extension using the tool? Do you know what you're doing?"* The answer
was no, and this is what should have happened first.

**Scope.** Four independent provenances so they could disagree: the ExTester tool
itself, what real webview-heavy extensions actually do, Microsoft's official
position, and the test-architecture question of faking a cloud boundary from
outside the process.

**Why it matters here.** The extension is almost entirely webviews — eight
bundles: a multi-step wizard, dashboards, a sidebar webview view, config panels.
The owner's goal is to run targeted workflows through BOTH the UI and the MCP
tools an agent drives, as a gate before a release reaches the team.

---

## The short version

1. **ExTester is probably the wrong long-term tool for this extension.** Nobody
   drives webview content with it by choice any more. The serious projects
   converged on Playwright over Electron. Every ExTester-on-webview suite that was
   read carries a hand-written stabilisation layer to fight one specific race;
   none of the Playwright suites needed one.
2. **The majority pattern is cheaper than either**: test the extension host in a
   real VS Code, test the webview UI separately in jsdom, and never drive the
   webview through a browser driver at all.
3. **The cloud boundary CAN be faked from outside the process**, and the
   mechanism is already built into VS Code.
4. **Microsoft says nothing about testing webviews** — confirmed with controls —
   but tests them itself, over `postMessage`, from the extension host.
5. **The paired UI-and-agent gate has a real name and canonical literature.** The
   MCP half has official scriptable tooling. Nobody has published doing the
   pairing as a release gate.

---

## 1. What real projects do — the finding that should decide the tool

Read from repository files at HEAD, not from READMEs.

**Drives real webview DOM, and how:**

| Project | Webview UI | Tool |
|---|---|---|
| GitLens | Lit, heavy | **Playwright + Electron**, 20 specs |
| Cline | React, whole UI | **Playwright + Electron**, ~8 specs |
| Salesforce DX | SOQL builder | **Playwright + Electron**, published as a reusable package |
| DVC | React | **WebdriverIO** + `wdio-vscode-service` |
| CodeQL | React | **Playwright against code-server in Docker**, 1 spec |
| Continue | React | **ExTester** — and the main GUI suite is `describe.skip`'d |
| Logic Apps, Kaoto, OpenShift Toolkit | React | **ExTester** (all Red Hat–adjacent) |

**Does NOT drive webview DOM at all:** GitHub Pull Requests, SonarLint, Jupyter,
Edge DevTools, Draw.io Integration, Roo Code, Azure tools.

Three of the most webview-dependent extensions in existence have **no UI tests
whatsoever**: Draw.io Integration (9.5k stars, the entire UI is a webview, CI is
lint plus build), Edge DevTools (the product IS DevTools in a webview), and
Jupyter (no browser driver anywhere in the repo).

**Magnitude, from GitHub code search — indicative, file matches not repos:**

| Signal | Matches |
|---|---|
| `@vscode/test-electron` in a package.json | ~29,400 |
| `@vscode/test-cli` in a package.json | ~14,500 |
| `vscode-extension-tester` in a package.json | **382** |
| `_electron.launch` with "vscode" in TS | **160** |

Two orders of magnitude between "runs tests in a real VS Code" and "drives the UI
with a browser driver".

### The quality difference is visible in the code

Every ExTester-on-webview suite read carries a stabilisation layer that exists
purely to fight the frame-switch and render race:

- **Azure Logic Apps** — one file, 1,567 lines, **44 fixed `sleep()` calls**,
  constants named `DESIGNER_OPEN_WAIT = 15s`, `switchToFrame` wrapped in a
  3-attempt retry, test files ordered by filename because one depends on
  another's output. Its own header admits: *"We verify that the webview OPENS,
  not that the designer fully initialises."*
- **OpenShift Toolkit** — a base page object method `findElementSparse` whose
  comment is the single most useful thing in this research: a tight `driver.wait`
  poll **starves the webview's own JS thread**, because the XPath query re-runs on
  the same single thread the UI library needs to finish rendering. So they
  deliberately sleep 2s, then poll every 1.5s.
- **Kaoto** — the best-organised of them, and still contains
  `workaroundToRedrawContextualMenu` and a "stabilize" sleep for macOS CI.
- **Continue** — decent code, zero fixed sleeps, and `describe.skip("GUI Test")`
  since 2025-09-10 with the commit message *"skip gui tests for now"*.

By contrast GitLens' graph specs contain **zero sleeps** — `expect.poll` and
`expect(...).toPass()`, each with a comment naming the race it guards.

### The two patterns most applicable here

**GitHub Pull Requests — the cheapest thing on the list, and the closest match.**
`src/test/mocks/mockWebviewEnvironment.ts` is a ~90-line fake that installs
`global.acquireVsCodeApi` returning a stub with `postMessage`/`getState`/`setState`,
recording messages and persisted state. It is installed by the mocha bootstrap
before any test loads, so a webview React component can be rendered with Testing
Library and the test asserts BOTH the DOM and **what the webview posted back**.
One of their tests calls `handleMessage({command: 'pr.update', …})` directly — a
contract test on the inbound message shape with no rendering at all.

**GitLens — the split worth copying regardless of tool.** Logic tested with plain
assertions and no DOM; rendering tested with Playwright; nothing in between.
GitLens has no jsdom or Testing Library dependency at all.

Their Playwright setup also solves the setup problem elegantly: a ~90-line helper
extension runs an HTTP server inside the extension host that accepts a stringified
function and evaluates it with the real `vscode` module. Setup and state
manipulation go through the API; only assertions go through the DOM.

---

## 2. ExTester specifics — what went wrong here, precisely

Every problem hit on 2026-09-08 was version skew or misuse, not a tool defect.

**The installed version was 8.24.0, not 8.26** (the lockfile pinned it under a
`^8.24.0` range). VS Code 1.136.1 is exactly 8.26.0's tested maximum; 8.24.0's
ceiling was 1.131.0.

| Symptom seen | Actual cause |
|---|---|
| `closeAllEditors()` throws "no such element" | VS Code 1.134 renamed the tab close button's class. ExTester shipped a one-line locator override in **8.25.0**. The installed locator set topped out at 1.129 |
| `switchToFrame` silently reads the wrong frame | In 8.24.0 `switchToFrame` **returns silently** when it finds no frame. 8.25.0 replaced that with a descriptive error |
| Sidebar test read the wizard's content | `new WebviewView()` with no arguments defaults its bounding box to the **entire workbench**. Selection is geometric — largest overlap wins — so it picks the biggest webview on screen. Correct form: `new WebviewView(new SideBarView())` |
| `executeCommand` fails "element not interactable" after reading a frame | `Workbench.openCommandPrompt` has a webview special case that sends F1 to a **tab element** instead of using the keyboard chord, and throws when that tab is not interactable |

**Webview targeting has exactly two supported mechanisms**: pass the `EditorGroup`
to the constructor, or activate the tab first. `EditorView.openEditor(title)`
does both and returns a group-scoped `WebView`. **There is no way to name a
webview** — a maintainer says so directly in discussion #1493, and the feature
request for title-based targeting (#1486) was closed as "completed" by the
geometry PR without the requested feature being built.

**The unresolved risk for this repo.** This extension sets
`retainContextWhenHidden: true` (`src/extension.ts:273`,
`src/core/base/baseWebviewCommand.ts:250`). That keeps hidden webviews' iframes in
the DOM, where they remain candidates for geometric selection. Issue #1890 is
exactly that configuration — reproducer supplied, zero maintainer replies,
auto-closed by a stale bot in April 2026. The 8.25/8.26 fix changed detection and
polling, **not the geometry ranking**, so it is not known to help. With eight
webview bundles this is the largest open risk, and no upgrade addresses it.

---

## 3. Microsoft's position — silence, confirmed with controls

**Official guidance stops at the extension host.** Zero files in the docs repo
mention both "webview" and any test-runner term. Positive control: 95 files
mention webviews at all. None of the four webview samples ships a single test;
only 5 samples in the entire repo have tests and none involves a webview.

The webview guide's only testing sentence is about checking high-contrast mode by
hand. Its verification story is "open Developer Tools and look".

**But Microsoft tests webviews itself, over `postMessage`.**
`extensions/vscode-api-tests/src/singlefolder-tests/webview.test.ts` is an
extension-host Mocha suite that creates a real panel, assigns HTML with an inline
script calling `acquireVsCodeApi()`, registers `onDidReceiveMessage`, and races
the result promise against `onDidDispose` so a crashed webview fails instead of
hanging. The webview script forwards `window.onerror` and `unhandledrejection`
back over `postMessage` — **without that, a webview-side exception looks like a
timeout.** That detail is worth stealing whatever tool is chosen.

**Two corrections to what was built here:**

- **`@vscode/test-electron` passes `--disable-workspace-trust` on every run**, and
  has since 2021. The flag added in `tests/electron/runTest.js` is redundant, and
  the comment claiming it is what makes the trust assertion true is **false**.
- **The 2026 default is a `.vscode-test.mjs` config file**, not a hand-written
  runner. The official generator scaffolds it. The catch: `@vscode/test-cli` owns
  `--extensionTestsPath` and points it at its own bundled Mocha runner, so the
  zero-dependency plain-assertion approach used here cannot survive the move. That
  is a real trade-off, not an obvious upgrade.

**`ExtensionMode.Test` is a computed label; nothing in VS Code branches on it.**
It is documented in one sentence. But Microsoft's own bundled Copilot extension
checks it and swaps in null services
(`extensions/copilot/src/extension/extension/vscode/services.ts`), and returns its
DI accessor to tests instead of the public API object. So "check test mode and
inject fakes" is **established first-party practice with zero documentation** —
neither a hack nor blessed.

**CI:** Linux needs `xvfb`; macOS does not, demonstrated in the official workflow
and never explained. Isolation is automatic — `test-electron` already adds
`--extensions-dir` and `--user-data-dir` unless overridden.

---

## 4. Faking the cloud boundary from outside the process

The wizard, driven end to end, creates real resources in Adobe, GitHub and
DA.live. A UI test runs in a different process from the extension host, so it
cannot patch modules there.

**In-process mocking is a non-answer for a UI driver.** nock overrides
`http.request` in its own module registry; Polly's node adapter uses nock; MSW's
cross-process story still requires MSW running inside the app and was never
shipped. All three are fine for handler-level tests and useless for this.

**The decisive fact: VS Code already routes the extension host through an
env-var proxy.** `http.proxySupport` defaults to `'override'`; the extension host
patches `http`, `https`, `undici` and `globalThis.fetch`, and the resolver checks
`HTTP_PROXY`/`HTTPS_PROXY` environment variables. So an outside process can
redirect every call the extension makes **without any hook inside the
extension**. (In a plain Node process this would not work — Node ignores those
variables unless explicitly opted in.)

**The trap, and it is the dangerous one:** most record-and-replay proxies
**forward unmatched requests to the real server by default**. mitmproxy's
`server_replay_extra` defaults to `forward`; there is a report that even
`--server-replay-extra=kill` completes the TLS handshake with the real host first.
For "must never touch live Adobe", unmatched must be killed AND egress blocked, so
anything missed fails loudly rather than quietly creating a resource.

**Options that survive the process boundary:** a forward proxy (WireMock has the
best combination of forward-proxying, recording and hand-editable stubs;
mitmproxy, Hoverfly, MockServer, mockttp and talkback all qualify), endpoint
overrides where each client exposes a base URL, and env-gated fakes inside the
extension.

**Two prior-art examples worth copying over inventing:**

- **CodeQL ships a mock GitHub API server inside the extension**, toggled by a
  setting, with commands to RECORD a real cloud run into a scenario and replay it
  later. Scenarios are checked in. That is the closest published analogue to the
  Adobe/GitHub/DA.live problem.
- **Cline runs a local fake server** on a fixed port with test-facing setters
  (`setUserBalance`, `setOrgBalance`), points the extension at it with an env var,
  and isolates the data directory so a test never touches real developer state.

**And a caveat on the framing.** The "no seam" problem applies to the OUT-OF-PROCESS
driver only. A `@vscode/test-electron` test script runs INSIDE the extension host
and can reach `extensions.getExtension(id).exports` — so the activation tier can
be handed fakes directly, with no proxy and no shipped test path. Roo Code's
suite drives the exported API exactly this way.

**Also worth copying: Azure's `TestUserInput`.** Their wizard engine takes an
injectable prompt surface, and tests feed it an ordered array of answers including
`TestInput.BackButton` — so backwards navigation and sub-wizards are testable
without any UI at all. The harness ships in the product for downstream reuse.
Their wizards are quick-picks rather than webviews, but the shape transfers.

**The warning.** GitLens' only sleep-ridden spec is its multi-step wizard test —
2,000+ lines with ~20 fixed waits, against zero in every webview spec in the same
suite. Multi-step flows are where fixed waits creep back even in a codebase that
plainly knows better.

---

## 5. The paired UI-and-agent gate

**The pattern has a name and a literature.** Specification → DSL → **protocol
driver** → system: the four-layer acceptance-test model, which is the
acceptance-testing expression of ports and adapters. Cockburn's original stated
intent is *"allow an application to equally be driven by users, programs,
automated test or batch scripts"* — which is literally two driving adapters over
one set of handlers. Farley's LMAX ran one scenario through different channels via
a `Channel` annotation; that is the closest published precedent.

**The MCP half has official tooling.** The MCP Inspector ships a scriptable CLI
(`--cli`) with `--method tools/call`, `--tool-name`, `--tool-arg`, and **distinct
exit codes** (0 success, 5 tool error, and so on) with a JSON error envelope on
stderr. That is enough to express a workflow as a sequence of tool calls and fail
CI on any step.

**Nobody has published doing the pairing as a release gate.** The single public
artifact found — a PRD for validating UI/MCP/CLI operation parity — is closed as
specified-but-not-shipped, and its design is a **registry-driven coverage matrix**
rather than a scenario suite. That is much closer to this repo's existing
`ai-coverage-scan` than to Gherkin, and it is a signal worth weighing: the one
team that hit this publicly reached for inventory-and-gap first, scenario replay
second.

**Contract testing for MCP is not established** — the one concrete attempt was
closed as not planned.

**No measured evidence** exists that multi-driver acceptance suites pay off. The
argument is design reasoning from credible practitioners plus demo repos. The
documented cost is driver count, and the known failure mode is scenario language
leaking channel details.

---

## What this suggests, in order

1. **Fix what is known-wrong now**: `new WebviewView(new SideBarView())`, the
   false workspace-trust comment, the ExTester version and a pinned
   `--code_version`. Cheap, and the sidebar test is currently able to pass against
   the wrong surface.
2. **Do not build more ExTester webview coverage** until the tool question is
   settled. The evidence says the projects that took this seriously chose
   Playwright over Electron, and the ExTester suites carry stabilisation layers
   that Playwright suites do not need.
3. **The cheapest real coverage is the `postMessage` contract from the extension
   host**, the way Microsoft tests its own. It runs in the tier that already
   works, needs no browser driver, and catches "the surface renders nothing"
   honestly.
4. **For the cloud boundary, prefer a record-and-replay proxy over shipping test
   paths** — with unmatched requests killed and egress blocked. CodeQL's in-product
   mock server is the fallback if the proxy proves leaky.
5. **For the paired gate, weigh a coverage registry against a scenario suite.**
   The existing `ai-coverage-scan` is already half of the former.

---

## What could not be established

- Whether the 8.25/8.26 fix resolves the `retainContextWhenHidden` mis-selection.
  The commit changed detection and polling, not the geometry ranking; the issue
  was never re-tested and was closed by a bot. **This is the largest open risk for
  an eight-webview extension and it is unresolved upstream.**
- Whether a hidden-but-retained webview iframe reports a zero-area or offscreen
  rect on VS Code 1.136. That single fact decides whether geometric selection is
  safe here. It needs a DevTools measurement against a live instance.
- Whether `extensionTestsEnv` propagates into the extension host process itself
  (documented only as reaching the test script). A five-minute experiment settles
  it, and the whole proxy approach depends on it.
- Whether the proxy patch covers dependencies bundling their own transport, and
  whether the CLIs this extension shells out to honour `HTTPS_PROXY`. Both decide
  whether a proxy is a complete fence or a leaky one.
- Whether any of the surveyed UI suites is actually GREEN. Code and CI config were
  read; pass rates, flake rates and re-run frequency were not.
- How ExTester behaves against Adobe Spectrum specifically. The thread-starvation
  finding is about Material-UI; whether Spectrum shares that failure mode is
  unverified.
- Any measured evidence on multi-driver acceptance suites paying off.

---

## Sources

ExTester: the project's own `webView.test.ts` and `webviewView.test.ts`,
`KNOWN_ISSUES.md`, the supported-versions page, the WebView and WebviewView page
object docs, locators `1.134.0.ts`, commits `3608392fe` and `99b2f7101`, issues
#2450, #2522, #1890, #1931, #1798, #1492, #1486, #378, #176, PRs #1727 and #2477,
discussions #1493 and #1690.

Microsoft: `testing-extension.md`, `continuous-integration.md`, `webview.md`,
`workspace-trust.md`, the VS Code API reference and `vscode.d.ts`,
`extHostExtensionService.ts`, `workspaceTrust.ts`, `argv.ts`,
`vscode-api-tests/webview.test.ts`, the Copilot extension's `services.ts`,
`@vscode/test-cli` `config.cts` and `desktop.mts`, `@vscode/test-electron`
`runTest.ts` and `util.ts`, `vscode-extension-samples`, `vscode-generator-code`.

Projects: GitLens `tests/e2e/`, GitHub Pull Requests
`src/test/mocks/mockWebviewEnvironment.ts`, Cline `apps/vscode/src/test/e2e/`,
Continue `extensions/vscode/e2e/`, Roo Code `apps/vscode-e2e/`, SonarLint,
Jupyter, Edge DevTools `test/common/webviewEvents.test.ts`, Draw.io Integration,
CodeQL `docs/testing.md` and `test/e2e/`, DVC `extension/src/test/e2e/`,
Salesforce `packages/playwright-vscode-ext/`, Azure `utils/test/AzureWizard.test.ts`,
Logic Apps `designerOpen.test.ts`, Kaoto `KaotoEditor.ts`, OpenShift Toolkit
`WebViewForm.ts`, TypeFox `vscode-messenger`.

Architecture: Node `cli.md`, VS Code `request.ts` and `proxyResolver.ts`,
`vscode-proxy-agent/src/index.ts`, nock, Polly.js, MSW PR #1617, mitmproxy docs
and issue #7890, WireMock, Hoverfly, MockServer, talkback, mockttp, Pact docs,
LocalStack guides, octokit.js, MCP Inspector and its CLI README, MCPJam,
IBM/mcp-context-forge#281, SteepleInc/church-work#336, Cockburn on hexagonal
architecture, Farley via ThinkingLabs, *Learn Go with Tests* scaling acceptance
tests, Serenity/JS screenplay handbook, Cucumber anti-patterns.
