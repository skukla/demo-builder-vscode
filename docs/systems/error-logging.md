# Error logging

Errors go through `ErrorLogger` rather than a bare `logger.error`, because an error
has two audiences and a bare call only serves one.

The channels and the three loggers are in
[`src/core/logging/README.md`](../../src/core/logging/README.md); the step-message
vocabulary is in [logging-system.md](logging-system.md).

## What ErrorLogger adds

**A status bar item** bound to `demoBuilder.showLogs`, so an error that scrolled past
is still reachable. It hides itself when there is nothing to report — a permanent
indicator becomes furniture and stops being read.

**Problems panel entries** for errors that map to a file, so the user can navigate to
the cause rather than reading a path out of a log.

**Notifications for critical errors only.** Everything else stays in the channels.
The threshold matters: an extension that notifies on recoverable errors trains people
to dismiss its notifications, and then the one that mattered is dismissed too.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). A handler returns its
failure rather than throwing — this system reports errors that already reached the
top, and does not change how they travel.
