#!/usr/bin/env python3
"""Watch memory, swap and CPU while the mutation burn-down loop runs, and act before the
machine suffers (2026-10-09: two runaway scans filled 51 GB of swap unnoticed).

runs.sh starts this beside itself and stops it when it exits, so every loop is watched
without anybody remembering to start a watcher. It also exits by itself when the loop's
process is gone, which covers a loop that was killed outright.

Every minute it records one line. It acts in two steps, mildest first:
  1. A single node/Python process (never another app) over PROC_LIMIT_GB is killed. The loop
     treats that as one failed measurement and carries on.
  2. If the machine is still short (swap over SWAP_LIMIT_GB, or free memory under
     FREE_FLOOR_PCT) for THREE checks in a row, it drops the loop's own stop file, so the
     loop finishes its current batch and stops cleanly. It never kills the loop itself.

Usage: resource_guard.py <repo> <log> <loop pid>
"""
import os
import re
import subprocess
import sys
import time

REPO, LOG, LOOP_PID = sys.argv[1], sys.argv[2], int(sys.argv[3])
STOP_FILE = os.path.join(REPO, '.rptc/handoff/STOP-RUNS')
PROC_LIMIT_GB = 10.0
SWAP_LIMIT_GB = 16.0
FREE_FLOOR_PCT = 15
OURS = ('node', 'Python', 'python3', 'python', 'stryker', 'npm')


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout


def gb(text):
    m = re.match(r'([\d.]+)([KMG])', text)
    if not m:
        return 0.0
    n = float(m.group(1))
    return {'K': n / 1048576, 'M': n / 1024, 'G': n}[m.group(2)]


def read():
    swap = sh(['sysctl', '-n', 'vm.swapusage'])
    used = re.search(r'used = ([\d.]+)M', swap)
    swap_gb = float(used.group(1)) / 1024 if used else 0.0
    free = re.search(r'free percentage: (\d+)%', sh(['memory_pressure']))
    free_pct = int(free.group(1)) if free else -1
    load = os.getloadavg()[0]
    procs = []
    for line in sh(['top', '-l', '1', '-o', 'mem', '-n', '12', '-stats', 'pid,command,mem']).splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0].isdigit():
            procs.append((int(parts[0]), ' '.join(parts[1:-1]), gb(parts[-1])))
    return swap_gb, free_pct, load, procs


def note(text):
    stamp = time.strftime('%Y-%m-%d %H:%M')
    with open(LOG, 'a') as fh:
        fh.write(f'{stamp}  {text}\n')


def loop_running():
    try:
        os.kill(LOOP_PID, 0)
        return True
    except OSError:
        return False


def main():
    note(f'guard started: kill one of ours over {PROC_LIMIT_GB:.0f} GB; stop the loop when swap is over '
         f'{SWAP_LIMIT_GB:.0f} GB or free memory under {FREE_FLOOR_PCT}% three checks running')
    short = 0
    peak_swap = peak_load = 0.0
    low_free = 100
    while True:
        try:
            swap_gb, free_pct, load, procs = read()
        except Exception as error:  # a failed read is noted, never fatal
            note(f'read failed: {error}')
            time.sleep(60)
            continue
        peak_swap, peak_load = max(peak_swap, swap_gb), max(peak_load, load)
        if free_pct >= 0:
            low_free = min(low_free, free_pct)
        biggest = procs[0] if procs else (0, '?', 0.0)
        note(f'swap {swap_gb:.1f} GB | free {free_pct}% | load {load:.1f} | biggest {biggest[1]} {biggest[2]:.1f} GB '
             f'| peaks: swap {peak_swap:.1f} GB, load {peak_load:.1f}, lowest free {low_free}%')
        for pid, name, size in procs:
            if size > PROC_LIMIT_GB and name.strip() in OURS:
                note(f'ACTION: killing {name} pid {pid} at {size:.1f} GB (over {PROC_LIMIT_GB:.0f} GB)')
                try:
                    os.kill(pid, 15)
                except OSError as error:
                    note(f'kill failed: {error}')
        if swap_gb > SWAP_LIMIT_GB or (0 <= free_pct < FREE_FLOOR_PCT):
            short += 1
            if short >= 3 and not os.path.exists(STOP_FILE):
                note(f'ACTION: machine short on memory three checks running (swap {swap_gb:.1f} GB, free {free_pct}%); '
                     'dropping the stop file so the loop ends after its current batch')
                open(STOP_FILE, 'w').close()
        else:
            short = 0
        if not loop_running():
            note('loop has ended; guard exiting')
            return
        time.sleep(60)


if __name__ == '__main__':
    main()
