#!/usr/bin/env bash
#
# One-time setup after Claude wrote the repo to disk (it can't write .git or .github/workflows
# remotely): moves the CI workflow into place, restores executable bits and makes the first commit.
#
#   bash scripts/init-repo.sh

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -f ci.yml ]]; then
    mkdir -p .github/workflows
    mv ci.yml .github/workflows/ci.yml
fi

chmod +x android/gradlew android/dev android/.maestro/run.sh scripts/init-repo.sh

if [[ ! -d .git ]]; then
    git init -q -b main
    git add -A
    git commit -q -F - <<'MSG'
Set up Veloq OS monorepo: web dashboard, .NET API and Android app

- api/: .NET 10 minimal API with projects, chores/jobs, routines, inbox
  actions with undo, calendar with bookable suggestions, artifacts and a
  plan-first prompt stub. Integrations behind IAgent, IInboxProvider and
  ICalendarProvider; xUnit unit and integration tests; API key header.
- web/: React + Vite dashboard (variant C) in the Veloq Labs design system:
  orbit of projects around chores, today timeline, jobs, quick prompt,
  Google Calendar card, full inbox with actions, artifact shelf. Vitest and
  Playwright tests.
- android/: Kotlin + Compose app (variant A) with home, prompt, projects,
  inbox and more tabs, calendar card and server settings. Same toolchain as
  HaloDeck; JUnit tests and Maestro flows.
- docs/, CLAUDE.md, README and path-filtered CI for all three.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GkqEmm7SUtnaeWQrpheZhF
MSG
    echo "Repo initialised: $(git log --oneline -1)"
else
    echo "Git repo already exists – left as is."
fi
