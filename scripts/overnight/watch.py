#!/usr/bin/env python3
"""Follow the overnight queue and narrate it as it happens.

Read-only: it tails logs and reads `git log`. It never writes, so it is safe
beside the queue, which owns the working tree.

GRANULARITY IS THE WHOLE DESIGN PROBLEM, and it took three tries.

Sampling state every 90s said almost nothing while a great deal happened. Then
one line per assistant TURN — which sounded like the readable unit and is not:
this session emits a separate message per tool call, so "per turn" collapsed to
"per message" and produced a wall of `(working) [Bash]` carrying no information
at all.

What a person can actually follow is what the session SAYS. So: emit text-
bearing turns verbatim, and never emit a turn that is only a tool call. Tool
activity still matters as a sign of life, so it accrues into a tally flushed at
most once a minute — `· 34 tool calls (Bash×20, Edit×11, Read×3)`.

Four things interrupt immediately, because they change what you would do: a
commit landing, a ledger number moving, any failure signature, and — the one
that matters most — an ENFORCER being edited.

That last one exists because a ratchet can reach zero two ways: the work was
done, or the detector was narrowed until it stopped seeing anything. Both print
`0`, and a goal evaluator reading the transcript cannot tell them apart. So the
CHECK ITSELF is watched separately from the number it produces.

Failure signatures sit in the same filter as the progress ones deliberately. A
watcher that greps only for good news is silent through a crash, and silence is
indistinguishable from working.
"""
import json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
HANDOFF = os.path.join(REPO, '.rptc/handoff')
LAUNCH = os.path.join(HANDOFF, 'overnight-launch.log')
LEDGER = os.path.join(REPO, 'tests/sop/type-erasing-casts.ledger.json')
FAKES = os.path.join(REPO, 'tests/sop/canonical-fakes.ledger.json')

FAIL = re.compile(r'Goal cleared|unrecoverable error|REFUSED|exhausted|'
                  r'not available|No goal set', re.I)


def read(p):
    try:
        with open(p, encoding='utf-8', errors='replace') as fh:
            return fh.read()
    except OSError:
        return ''


def emit(msg):
    print('%s  %s' % (time.strftime('%H:%M'), msg))
    sys.stdout.flush()


def rundir():
    """Newest overnight-<stamp> directory, or None before the queue creates it."""
    try:
        ds = [d for d in os.listdir(HANDOFF) if d.startswith('overnight-2')]
    except OSError:
        return None
    ds = [os.path.join(HANDOFF, d) for d in ds]
    ds = [d for d in ds if os.path.isdir(d)]
    return max(ds, key=os.path.getmtime) if ds else None


def ledger_state():
    out = {}
    try:
        out.update(json.loads(read(LEDGER))['ceilings'])
    except Exception:
        pass
    try:
        out['Project'] = json.loads(read(FAKES))['castCeilings']['Project']
    except Exception:
        pass
    return out


def enforcers_touched():
    """Enforcer SOURCE files with uncommitted edits — not their .json ledgers.

    Lowering a ledger's recorded number is the normal, honest move. Editing the
    detector that produces it is how a ratchet gets quietly weakened, so the two
    are reported differently.
    """
    r = subprocess.run(['git', '-C', REPO, 'status', '--porcelain', 'tests/sop/'],
                       capture_output=True, text=True)
    out = []
    for line in r.stdout.strip().split('\n'):
        if not line.strip():
            continue
        path = line[3:].strip()
        if path.endswith('.ts'):
            out.append(path)
    return sorted(out)


def commits():
    r = subprocess.run(['git', '-C', REPO, 'log', '--oneline', 'develop..HEAD'],
                       capture_output=True, text=True)
    return [l for l in r.stdout.strip().split('\n') if l]


offsets = {}          # jsonl path -> bytes consumed
pending = {}          # tool name -> count, flushed as one tally line
last_tally = time.time()
TALLY_EVERY = 300     # seconds — a sign of life, not a transcript.
                      # Was 60, which during a long reading phase meant a
                      # content-free line every minute. The tally exists to say
                      # "still alive" during silence; five minutes says that
                      # just as well and leaves the feed to the narration.
prev_ledger = ledger_state()
prev_commits = len(commits())
prev_item = None
seen_fail = set()
seen_enforcers = set()

# START AT THE END OF WHAT ALREADY EXISTS. Every restart of this watcher used to
# replay the whole log from byte 0, so the reader saw the same catch-up block
# again each time and could not tell replay from new activity. Seek past it and
# say in one line what was skipped.
_d = rundir()
if _d:
    _caught = 0
    for _n in sorted(os.listdir(_d)):
        if not _n.endswith('.jsonl'):
            continue
        _p = os.path.join(_d, _n)
        try:
            offsets[_p] = os.path.getsize(_p)
        except OSError:
            continue
        _caught += 1
    if _caught:
        emit('(resumed — skipping %d log(s) already written; only new activity from here)' % _caught)
for _m in FAIL.finditer(read(LAUNCH)):
    seen_fail.add((_m.start(), _m.group(0)))
for _f in enforcers_touched():
    seen_enforcers.add(_f)
emit('watching — %s' % ' · '.join('%s %s' % kv for kv in sorted(prev_ledger.items())))

while True:
    launch = read(LAUNCH)

    items = re.findall(r'════ (\S+) —', launch)
    if items and items[-1] != prev_item:
        prev_item = items[-1]
        emit('▶ started %s' % prev_item)

    d = rundir()
    if d:
        for name in sorted(os.listdir(d)):
            if not name.endswith('.jsonl'):
                continue
            path = os.path.join(d, name)
            start = offsets.get(path, 0)
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            if size <= start:
                continue
            with open(path, encoding='utf-8', errors='replace') as fh:
                fh.seek(start)
                chunk = fh.read()
            offsets[path] = start + len(chunk.encode('utf-8', 'replace'))

            for line in chunk.split('\n'):
                line = line.strip()
                if not line.startswith('{'):
                    continue
                try:
                    m = json.loads(line)
                except ValueError:
                    continue
                if m.get('type') != 'assistant':
                    continue
                text, tools = '', []
                for b in (m.get('message', {}).get('content') or []):
                    if b.get('type') == 'text' and b.get('text', '').strip():
                        text = ' '.join(b['text'].split())
                    elif b.get('type') == 'tool_use':
                        tools.append(b.get('name', '?'))
                for t in tools:
                    pending[t] = pending.get(t, 0) + 1
                if not text:
                    continue          # a tool-only turn says nothing; it is a tally, not a line
                emit(text[:240])

    if pending and time.time() - last_tally >= TALLY_EVERY:
        emit('· %d tool calls (%s)' % (
            sum(pending.values()),
            ', '.join('%s×%d' % kv for kv in sorted(pending.items(), key=lambda x: -x[1]))))
        pending.clear()
        last_tally = time.time()

    touched = enforcers_touched()
    for f in touched:
        if f not in seen_enforcers:
            seen_enforcers.add(f)
            emit('⚠ ENFORCER EDITED: %s — a ratchet can hit zero because the work '
                 'was done OR because the detector stopped looking. Read this diff.' % f)

    now = ledger_state()
    if now != prev_ledger:
        moved = ['%s %s→%s' % (k, prev_ledger.get(k, '?'), v)
                 for k, v in now.items() if prev_ledger.get(k) != v]
        emit('📉 ledger: %s' % ' · '.join(moved))
        prev_ledger = now

    cur = commits()
    if len(cur) != prev_commits:
        for c in cur[:len(cur) - prev_commits]:
            emit('✔ commit  %s' % c[:96])
        prev_commits = len(cur)

    for mm in FAIL.finditer(launch):
        key = (mm.start(), mm.group(0))
        if key not in seen_fail:
            seen_fail.add(key)
            emit('⚠ %s' % ' '.join(launch[max(0, mm.start() - 80):mm.start() + 120].split())[:190])

    if 'queue done' in launch:
        emit('✓ QUEUE DONE — %d commit(s) on the branch' % len(cur))
        break

    time.sleep(10)
