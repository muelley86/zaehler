#!/usr/bin/env bash
# Backwards-kompatibler Alias für `zaehler.sh install`.
# Neue Aufrufe sollten direkt zaehler.sh benutzen.
exec "$(dirname "$0")/zaehler.sh" install "$@"
