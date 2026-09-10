#!/usr/bin/env python3
"""Start the burn-down driver in its OWN process session, detached from this one.

WHY. On 2026-09-04 the driver was killed twice, and both times the whole tree went
with it — driver, batch runner and the goal session — because stopping a background
task signals the process GROUP, and everything launched from this session shares it.
Nothing was lost either time (each module commits on its own), but the loop stopped
without anybody choosing to stop it.

os.setsid() in the forked child makes a new session and process group, so a signal
aimed at this session's group no longer reaches it. To stop it deliberately, use the
stop file the driver already honours:  touch .rptc/handoff/STOP-RUNS
"""
import os, sys, subprocess

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(REPO) if os.path.basename(REPO) == 'scripts' else REPO
log = os.path.join(REPO, '.rptc/handoff/driver-detached.log')

pid = os.fork()
if pid > 0:
    # Parent: report the child's pid and exit immediately.
    print(f'driver detached, pid {pid}; log: {log}')
    sys.exit(0)

os.setsid()                       # new session — signals to the old group miss us
with open(log, 'ab', buffering=0) as fh:
    os.dup2(fh.fileno(), 1)
    os.dup2(fh.fileno(), 2)
os.close(0)
os.execvp('caffeinate', ['caffeinate', '-ims', 'bash',
                         os.path.join(REPO, 'scripts/overnight/runs.sh')])
