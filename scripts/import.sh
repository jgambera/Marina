#!/bin/bash
# Artilect State Import
# Usage: ./scripts/import.sh <snapshot.json> [db_path] [--merge] [--skip-events]
#
# Imports an Artilect state snapshot into a database.
# Without --merge, all existing data is replaced.
# Stop the server before importing.

set -euo pipefail

cd "$(dirname "$0")/.."
exec bun scripts/state-import.ts "$@"
