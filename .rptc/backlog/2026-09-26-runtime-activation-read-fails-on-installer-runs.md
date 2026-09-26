---
id: AB-32
kind: fix
area: ai
needs: []
value: med
status: backlog
---

# read_runtime_activation cannot read the App Management installer's runs

Filed 2026-09-26 from the Northwind ERP re-add on Bodea. A defect in a tool [[AB-31]] shipped.

The install failed inside the app's App Management installer, a Runtime sequence run. Reading
that run with `read_runtime_activation` answered "Could not read this project's Adobe Runtime
namespace. See Debug Logs for the reason." every time. The same activation read fine through
the aio CLI (`aio console workspace download`, then `aio runtime activation get`), which is
how the real error was found: "Event metadata creation error: Could not login to Adobe IMS".

So the namespace was readable, and the refusal text is wrong about what failed. Not yet
investigated: whether the tool targets the project's workspace instead of the integration's
own (each add has its own workspace), or whether it fails on sequence activations only. Start
by reading the Debug Logs line the refusal points at, then one live read of an installer run
through the running dev host with `mcp-live-probe`.
