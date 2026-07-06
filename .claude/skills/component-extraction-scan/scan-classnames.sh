#!/usr/bin/env bash
#
# scan-classnames.sh — shortlist CSS classes rendered as hand-written markup across
# many .tsx files (component-extraction candidates). Prints each class token that
# appears in >= THRESHOLD distinct files, most-used first, with the files listed.
#
# Signal only, not a verdict: a class appearing widely is a CANDIDATE — triage each
# per SKILL.md (hand-written? near-identical structure? already owned by a component?).
#
# Limitation: matches double-quoted `className="…"` literals only (the dominant case).
# Template-literal / conditional classNames (`className={cn(...)}`) are missed.
#
# Usage: bash scan-classnames.sh [ROOT=src] [THRESHOLD=3]

set -uo pipefail
ROOT="${1:-src}"
THRESHOLD="${2:-3}"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# Utility/layout classes (Tailwind-ish + generics) are excluded — they are SUPPOSED to
# be reused widely and are never component-extraction candidates. Component-ish classes
# (a `foo` base with `foo-name` / `foo-note` children) survive the filter.
UTILITY_RE='^(text|bg|border|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min|max|flex|grid|gap|items|justify|self|content|place|font|leading|tracking|rounded|shadow|ring|opacity|z|top|left|right|bottom|inset|absolute|relative|fixed|sticky|static|block|inline|table|hidden|visible|space|divide|col|row|order|basis|grow|shrink|overflow|cursor|select|pointer|transition|duration|delay|ease|transform|translate|scale|rotate|skew|origin|whitespace|truncate|uppercase|lowercase|capitalize|italic|underline|antialiased|sr)(-|$)'

# Emit unique "class<TAB>file" pairs for every class token in a className="…" literal.
while IFS= read -r file; do
    grep -oE 'className="[^"]*"' "$file" 2>/dev/null \
        | sed -E 's/^className="//; s/"$//' \
        | tr ' ' '\n' \
        | grep -vE '^[[:space:]]*$' \
        | grep -vE "$UTILITY_RE" \
        | while IFS= read -r cls; do
            printf '%s\t%s\n' "$cls" "$file"
        done
done < <(find "$ROOT" -name '*.tsx' -type f) | sort -u >"$tmp"

# Aggregate: class -> distinct-file count, filter >= THRESHOLD, most-used first.
cut -f1 "$tmp" | sort | uniq -c | sort -rn \
    | awk -v t="$THRESHOLD" '$1 >= t { print }' \
    | while read -r count cls; do
        printf '### %s  (%s files)\n' "$cls" "$count"
        grep -E "^${cls}"$'\t' "$tmp" | cut -f2 | sed 's/^/  - /'
        printf '\n'
    done
