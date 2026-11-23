---
id: PL-98
kind: chore
area: platform
needs: []
value: low
status: backlog
---

# Batch question table shell

Filed 2026-11-16 by the beta.153 codebase sweep (component-extraction scan, read by hand).

Three batch windows build the same question table: `BatchDeleteQuestions.tsx:66`,
`BatchResetQuestions.tsx:47` and `UpdatesModal.tsx:97`. Each renders the same shell: a
`batch-confirm` wrapper, a `LeadText` line, a `batch-delete scroll-fade scroll-fade--capped` box,
a `batch-delete-table` whose head is a "Project" cell (`batch-changes-head batch-project-head`)
followed by column checkboxes with all, some and none states.

What differs is load-bearing: Delete has several option columns, Reset one optional column, Updates
groups its rows. So the proposal is a shell, not one component: a `BatchQuestionTable` that owns
the wrapper, the lead line, the scroll box and the head cell, and takes the columns and the body
from the caller.

Three sites, so the Rule of Three is met. Not blocking beta.153: the three render correctly today;
the cost is that a change to one (as the one-project reset wording was, live run 6) has to be made
three times.
