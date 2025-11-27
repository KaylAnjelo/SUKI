#!/usr/bin/env bash
# docker_pg_dump.sh
# Create a SQL dump using pg_dump inside the official Postgres image,
# compress it, run basic verification (size + presence of CREATE/COPY),
# and upload using the repo's `upload_file.js` script.

set -euo pipefail

# Configuration (can be exported in the environment or left as defaults)
DBHOST=${DBHOST:-${DATABASE_HOST:-}}
DBPORT=${DBPORT:-${DATABASE_PORT:-5432}}
DBUSER=${DBUSER:-${PGUSER:-postgres}}
DBPASS=${DBPASS:-${PGPASSWORD:-}}
DBNAME=${DBNAME:-${PGDATABASE:-postgres}}
OUT_PREFIX=${OUT_PREFIX:-backup}
MIN_BYTES=${MIN_BYTES:-10240} # 10 KB minimum by default

if [ -z "$DBHOST" ]; then
  echo "Missing DBHOST. Set DBHOST or DATABASE_HOST or ensure DATABASE_URL is provided." >&2
  exit 2
fi

if [ -z "$DBPASS" ]; then
  echo "Warning: DBPASS is empty. If your DB requires a password, set PGPASSWORD or DBPASS." >&2
fi

TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT_SQL="${OUT_PREFIX}-${TS}.sql"
OUT_GZ="${OUT_SQL}.gz"

echo "Starting dockerized pg_dump -> ${OUT_SQL}"

# run pg_dump inside postgres container and write to host mount
docker run --rm -e PGPASSWORD="$DBPASS" -v "$(pwd):/work" -w /work postgres:17 \
  pg_dump -h "$DBHOST" -p "$DBPORT" -U "$DBUSER" -d "$DBNAME" -F p -f "/work/${OUT_SQL}"

echo "Compressing..."
gzip -9 "$OUT_SQL"

echo "Computing checksum..."
sha256sum "$OUT_GZ" > "$OUT_GZ.sha256"
ls -lh "$OUT_GZ"
cat "$OUT_GZ.sha256"

BYTES=$(stat -c%s "$OUT_GZ")
if [ "$BYTES" -lt "$MIN_BYTES" ]; then
  echo "ERROR: dump is too small ($BYTES bytes < $MIN_BYTES) — aborting upload" >&2
  exit 3
fi

echo "Checking for CREATE TABLE / COPY in start of dump..."
if zcat "$OUT_GZ" | sed -n '1,131072p' | grep -Eiq '(^CREATE TABLE|^COPY )'; then
  echo "Schema marker found"
else
  echo "ERROR: dump does not appear to contain CREATE TABLE or COPY statements — aborting" >&2
  exit 4
fi

echo "Uploading using node scripts/upload_file.js"
if ! command -v node >/dev/null 2>&1; then
  echo "Node not found on PATH — install Node or run this script on a machine with Node available" >&2
  exit 5
fi

node scripts/upload_file.js "$OUT_GZ"

echo "Done. Uploaded ${OUT_GZ}." 
