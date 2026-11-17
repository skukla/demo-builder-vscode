---
id: PL-101
kind: feature
area: platform
needs: []
value: high
status: backlog
waiting-on: before the beta.153 cut (owner, 2026-11-17)
---

# What a run left to finish: one list, each item with its fix

Filed 2026-11-17 from the beta.153 release walk (U2.3, Scratch 1028 B's creation). Owner: "If there
are things that need to be fixed after the project run is completed, then we need to provide the UX
to allow the end user to take action on them … I don't want this to become a gap." And: "We need to
make sure to reuse as much UX and code as possible … I'm not trying to reinvent or invent new
solutions to similar problems." **In beta.153, as its own item.**

## Why a finished run can leave anything

Four kinds, from what the walk saw (F204, F207, F208, F209):

| Kind | Example | Who fixes it | Answer |
|---|---|---|---|
| 1. Demo Builder can fix it by trying again | code not yet served (AEM lags) | Demo Builder | retry before reporting; if it still fails, one action: Republish |
| 2. Only the SC can, in another system | a datapack's root category (Admin), the GitHub app | the SC | a guided step: Open Admin, then Check |
| 3. Something wrong in the content | a broken link on a demo page | the SC in DA.live, or an agent | Open in DA.live, or Fix with AI |
| 4. Nothing anyone needs to do | a link on the block library's own docs page | nobody | log only (done, F209) |

Kind 4 never reaches the SC; kind 1 mostly retries itself. The list holds kinds 2 and 3, and a
kind-1 retry that still failed. A leftover that keeps appearing is an upstream defect (the content,
the template) and gets fixed there.

Today they are scattered: sentences on end screens (read by nobody, F209), a dashboard dot (Needs
reset), the datapack card's "1 step left in the Admin", and lines only in Debug Logs. An SC who
misses the end screen has no way back to them.

## The design, from parts that exist

Each piece below is already built; the item is wiring them to one record.

- **One record on the project**, written by every run that can leave something (creation, reset,
  install, Republish): an item names what is left, its fix (an action key), and how to check it.
  An item cannot be added without its fix and its check, which is what stops the gap. The
  datapack's pending Admin step (`usePackSetupStep`, `PackSetupStepDialog`) is the working model.
- **The end screen says it in its title**, per the dialog rules: "Project Created, 2 Things to
  Finish", with one action, Review (`ResultDialog` / `JobResultWindow` titles and `actionButtons`).
- **Review opens one window listing each item with its own action**: the setup guide's step rows
  (`GuideDialog`, `SetupStepHeader`, `SetupStepFacts`: Where, Set, Then, Why, Open Admin, Check)
  for kind 2; `FlyoutActionList`-style rows for one-click fixes (Republish, Open in DA.live);
  Fix with AI where an agent can do it (`useRetryInstall`'s `fixWithAi`, the datapack job's).
  The integrations screen's Demo setup checklist (`SetupChecklistSection`, `useSetupChecklist`,
  `SetupGuideModal`, Check All Steps) is the same shape and the first candidate to share.
- **On the dashboard until it is empty**: an amber dot with hover text on the tile that fixes it
  (`DashboardTile`'s `status`, as Reset's Needs reset), and the same list one click away. The
  datapack card's "1 step left" with Show Step is the existing precedent.

## Decisions to make first (with recommendations)

1. **When the dashboard shows it**: from the moment a run ends with anything left, until each item's
   check passes. Recommended: yes, always; a skipped or missed step is exactly what must not vanish.
2. **Where on the dashboard**: on the tile that fixes it (Republish, Author Content, Configure),
   not a new banner. Recommended, per the status placement rule in `ActionGrid.tsx`.
3. **Kind 1 retries**: how many before it becomes an item. Recommended: the run's own retries
   (codeServed already publishes three rounds), then an item.
4. **Agents**: the same list read and fixed through a tool, so an agent sees what a person sees.

## Reuse check before building

Run `reuse-first` and `architecture-duplication-scan` against: `SetupChecklistSection` and
`useSetupChecklist` (integrations), `PackSetupStepDialog` and `usePackSetupStep` (datapacks),
`GuideDialog`, `SetupStepHeader`, `SetupStepFacts`, `FlyoutActionList`, `DashboardTile` status,
`useRetryInstall`. Two of these (the integrations checklist and the datapack step) already solve
"a step left for the SC, with Check": the item should end with one of them, not three.

## Done looks like

- A creation that leaves a kind-2 or kind-3 item says so in its end title, lists it with its fix,
  and the dashboard keeps it until its check passes; mocked and walked with the owner first.
- Every place that used to leave a sentence (end screens, Debug Logs only) writes a list item
  instead, or is confirmed as kind 4 and logs only.

## Revision, 2026-11-17 (owner): it is Demo Setup

The owner asked for the existing walk-through rather than a new list, and for the words of a
software application. So the run's leftovers become **Demo Setup steps on the project**, shown by
the guide the integrations already use, with its words:

- End screen: "Project Created" (title alone when nothing is left), with the line "Demo Setup: 0 of
  2 done" and the button **Open Demo Setup** (`setupStatusText`, `setupSummary`).
- The guide: `SetupGuideModal` / `GuideDialog` with each step's Where, Set, Then, Why
  (`SetupStepFacts`, `SetupStepHeader`), **Check All Steps**, **Open Commerce Admin**, **Apply
  This Step** for a step Demo Builder can do (republishing the code is one), **Mark as Done**.
  Step names are Title Case actions: "Set the Root Category", "Publish the Code Again".
- Project dashboard: the integration flyout's Demo Setup section (`SetupChecklistSection`):
  "Demo Setup: 0 of 2 done", **Open Demo Setup**, "Next: <step>". The tile dot stays for the
  tile that fixes a step.
- The record: `SetupChecklistItem` steps on the project, the type the integrations' steps use, so
  the guide, the check and the dashboard section need no second implementation. The datapack's
  one-step-left (`usePackSetupStep`) folds into it rather than staying a third.

Mock-up: the walk thread, 2026-11-17 ("Revised: trimmed Republish result and Demo Setup reuse").
