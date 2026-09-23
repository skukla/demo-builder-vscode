---
id: EDS-13d
kind: feature
area: eds
parent: EDS-13
needs: [EDS-13a, EDS-13b]
value: low
status: backlog
---

# A team catalog of shared demos

Filed 2026-09-11 by the owner as the last step of [[EDS-13]]: a shared list the whole
team reads, so a demo a colleague shared appears on every SC's Welcome grid without
anyone pasting a link.

## What it is

A list of demo entries (each either a full description in the contract's shape,
[[EDS-13c]], or just a repo link that "Add a demo" fills in) kept somewhere the team
owns, most likely a small file in a GitHub repo. The extension fetches it, keeps a copy
for offline use, and merges it with the bundled catalog before the wizard opens, pushed
into the wizard the way custom block libraries already are. `loadDemoPackages` already
says it returns a Promise "to support future async loading scenarios (e.g., remote
config)".

## Why it waits

Decided 2026-09-11: after [[EDS-13a]] and [[EDS-13b]] have shipped and real shared demos
exist to list. The questions only real use can answer: who may edit the list; what happens
when an entry stops working, since every SC now sees it; whether the extension trusts a
fetched file to say where code and content are copied from; what happens when the list is
unreachable (the answer should be "use the last copy", which has to be built); and what
removing an entry does to SCs already building on it (nothing, because the project stores
its own row, which [[EDS-13a]] guarantees).

## Value

`low` by the backlog's rule: nothing is blocked until it exists. It is still the piece
that makes a shared demo "there for everyone", which is the last gap in research §8.
