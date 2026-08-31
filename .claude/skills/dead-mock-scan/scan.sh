#!/usr/bin/env bash
#
# scan.sh — jest.mock calls that do nothing.
#
# Default (no args, or a ROOT): the STATIC half only. Fast, exact, no test runs —
# bare automocks of modules jest.config.js already redirects through
# moduleNameMapper. Safe to run in a sweep.
#
# The DYNAMIC half is opt-in and scoped, because the only general way to answer
# "does this mock do anything?" is to delete it and run the suite, which costs one
# jest run per mock:
#
#   bash scan.sh --verify 'tests/features/mesh/**/*.test.ts' 'mesh/services/meshVerifier' \
#       @/core/di @/core/logging
#
# Reported, never applied. Exit code says nothing about findings — read the output.
# Deleting a mock is a judgement call (see SKILL.md), which is why this is not a gate.
#
# Usage:
#   bash scan.sh [ROOT=tests]
#   bash scan.sh --verify '<file-glob>' '<jest-pattern>' <module>...

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
exec python3 .claude/skills/dead-mock-scan/detect.py "$@"
