#!/bin/sh
# Fake `qupon` CLI for tests: logs its argv, then replays a canned JSON
# contract. Behaviour driven by env vars:
#   FAKE_CLI_LOG     append every invocation's argv here
#   FAKE_CLI_STDOUT  print this file's contents on stdout (default: ok JSON)
#   FAKE_CLI_STDERR  print this file's contents on stderr
#   FAKE_CLI_EXIT    exit code (default 0)
#   FAKE_CLI_SLEEP   sleep this many seconds before replying (concurrency tests)
[ -n "$FAKE_CLI_LOG" ] && printf '%s\n' "$*" >>"$FAKE_CLI_LOG"
[ -n "$FAKE_CLI_SLEEP" ] && sleep "$FAKE_CLI_SLEEP"
[ -f "$FAKE_CLI_STDOUT" ] && cat "$FAKE_CLI_STDOUT"
[ -f "$FAKE_CLI_STDERR" ] && cat "$FAKE_CLI_STDERR" >&2
exit "${FAKE_CLI_EXIT:-0}"
