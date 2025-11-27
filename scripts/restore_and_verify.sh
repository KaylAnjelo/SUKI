#!/usr/bin/env bash
set -euo pipefail

# restore_and_verify.sh
# Usage: ./scripts/restore_and_verify.sh [path-to-export-dir-or-tar.gz]
# If no argument is given the script uses the newest directory matching tmp/export-*

WORKDIR=$(pwd)
ARG=${1:-}

if [ -z "$ARG" ]; then
  EXPORT_DIR=$(ls -dt tmp/export-* 2>/dev/null | head -n1 || true)
  if [ -z "$EXPORT_DIR" ]; then
    echo "No export found in tmp/ — pass an export dir or archive as the first argument." >&2
    exit 1
  fi
else
  if [ -f "$ARG" ] && [[ "$ARG" == *.tar.gz ]]; then
    TS=$(date +%s)
    EXPORT_DIR="tmp/restore-$TS"
    mkdir -p "$EXPORT_DIR"
    tar -xzf "$ARG" -C "$EXPORT_DIR"
  else
    EXPORT_DIR="$ARG"
  fi
fi

echo "Using export directory: $EXPORT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run this script." >&2
  exit 2
fi

CONTAINER_NAME="supa_restore_test_$(date +%s)_$RANDOM"
PGPASS="supa_restore_pass"
PGDB="supa_restore_db"

echo "Starting temporary Postgres container: $CONTAINER_NAME"
docker run -d --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_DB="$PGDB" postgres:15

echo "Waiting for Postgres to become ready..."
sleep 4

echo "Copying export files into container..."
docker cp "$WORKDIR/$EXPORT_DIR/." "$CONTAINER_NAME":/tmp/export

## Prefer a fixed schema file if present (databaseschema.fixed.sql) —
## this is a safe, reordered variant useful for local restores. Falls back
## to databaseschema.sql if fixed file not present.
if [ -f "$WORKDIR/databaseschema.fixed.sql" ]; then
  SCHEMA_FILE="databaseschema.fixed.sql"
elif [ -f "$WORKDIR/databaseschema.sql" ]; then
  SCHEMA_FILE="databaseschema.sql"
else
  SCHEMA_FILE=""
fi

if [ -n "$SCHEMA_FILE" ]; then
  echo "Applying top-level schema file: $SCHEMA_FILE"
  docker cp "$WORKDIR/$SCHEMA_FILE" "$CONTAINER_NAME":/tmp/databaseschema.sql
  # ensure log dir
  docker exec "$CONTAINER_NAME" bash -lc 'mkdir -p /tmp/restore_logs'
  docker exec "$CONTAINER_NAME" bash -lc "psql -U postgres -d $PGDB -f /tmp/databaseschema.sql > /tmp/restore_logs/databaseschema.sql.log 2>&1 || true"
else
  echo "No top-level schema file found (databaseschema.fixed.sql or databaseschema.sql)."
fi

echo "Applying schema files (if any)..."
if docker exec "$CONTAINER_NAME" bash -lc 'shopt -s nullglob; test -d /tmp/export/schema && ls /tmp/export/schema/*.sql >/dev/null 2>&1'; then
  # ensure log dir
  docker exec "$CONTAINER_NAME" bash -lc 'mkdir -p /tmp/restore_logs'
  for f in $(docker exec "$CONTAINER_NAME" bash -lc 'ls /tmp/export/schema/*.sql'); do
    echo "Applying schema: $f"
    base=$(basename "$f")
    # run and capture logs so we can inspect failures
    docker exec "$CONTAINER_NAME" bash -lc "psql -U postgres -d $PGDB -f '$f' > /tmp/restore_logs/$base.log 2>&1 || true"
    echo " -> log: /tmp/restore_logs/$base.log"
  done
else
  echo "No schema files found; continuing to CSV import (will attempt to create tables implicitly)."
fi

echo "Importing CSV files..."
if docker exec "$CONTAINER_NAME" bash -lc 'shopt -s nullglob; test -d /tmp/export/data && ls /tmp/export/data/*.csv >/dev/null 2>&1'; then
  echo "Disabling foreign key and trigger enforcement for import (session_replication_role=replica)"
  docker exec "$CONTAINER_NAME" bash -lc "psql -U postgres -d $PGDB -c \"SET session_replication_role = replica;\""
  for fname in $(docker exec "$CONTAINER_NAME" bash -lc 'ls /tmp/export/data/*.csv'); do
    base=$(basename "$fname")
    table=${base%.csv}
    echo "Importing table: $table from $base"

    # read header line from the CSV inside the container
    header=$(docker exec "$CONTAINER_NAME" bash -lc "head -n1 /tmp/export/data/$base | tr -d '\r'")
    # build a quoted column list: "col1","col2"
    IFS=',' read -r -a arr <<< "$header"
    cols=""
    for c in "${arr[@]}"; do
      # trim whitespace
      ctrim=$(echo "$c" | sed 's/^\s*//;s/\s*$//')
      # avoid empty column names
      if [ -z "$ctrim" ]; then continue; fi
      # quote identifier for psql
      cols="$cols\"$ctrim\","
    done
    cols=${cols%,}

    if [ -z "$cols" ]; then
      echo "Could not determine columns for $base — skipping" >&2
      continue
    fi

    # run \copy inside psql (runs on the server side reading the file inside container)
    echo "\copy public.\"$table\" ($cols) FROM '/tmp/export/data/$base' CSV HEADER" > /tmp/cmd.sql
    docker cp /tmp/cmd.sql "$CONTAINER_NAME":/tmp/cmd.sql
    docker exec -i "$CONTAINER_NAME" psql -U postgres -d "$PGDB" -f /tmp/cmd.sql || {
      echo "Import for $table failed; continuing with other tables. See /tmp/restore_logs for details." >&2
    }
    rm -f /tmp/cmd.sql
  done
  echo "Re-enabling enforcement (session_replication_role=origin)"
  docker exec "$CONTAINER_NAME" bash -lc "psql -U postgres -d $PGDB -c \"SET session_replication_role = origin;\""
else
  echo "No CSV files found in export/data; nothing to import." >&2
fi

echo "Verifying row counts between CSVs and DB..."
printf "%-30s %-10s %-10s %-10s\n" "table" "csv_rows" "db_rows" "match"
echo "--------------------------------------------------------------------------------"
if docker exec "$CONTAINER_NAME" bash -lc 'shopt -s nullglob; test -d /tmp/export/data && ls /tmp/export/data/*.csv >/dev/null 2>&1'; then
  for fname in $(docker exec "$CONTAINER_NAME" bash -lc 'ls /tmp/export/data/*.csv'); do
    base=$(basename "$fname")
    table=${base%.csv}
    csv_lines=$(docker exec "$CONTAINER_NAME" bash -lc "wc -l < /tmp/export/data/$base || echo 0")
    csv_rows=$((csv_lines>0 ? csv_lines-1 : 0))
    db_rows=$(docker exec "$CONTAINER_NAME" bash -lc "psql -U postgres -d $PGDB -t -A -c \"SELECT count(*) FROM public.\\\"$table\\\";\"" || echo 0)
    match="no"
    if [ "${csv_rows}" = "${db_rows}" ]; then match="yes"; fi
    printf "%-30s %-10s %-10s %-10s\n" "$table" "$csv_rows" "$db_rows" "$match"
  done
fi

echo
echo "Listing actual tables in the database..."
docker exec "$CONTAINER_NAME" bash -lc "psql -U postgres -d $PGDB -t -A -c \"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;\"" | sed '/^$/d' > /tmp/actual_tables.txt
docker exec "$CONTAINER_NAME" bash -lc 'ls /tmp/export/data/*.csv >/dev/null 2>&1 && for f in /tmp/export/data/*.csv; do basename "$f" .csv; done' > /tmp/expected_from_csv.txt || true
docker exec "$CONTAINER_NAME" bash -lc 'grep -oiE "create table\s+public\.[a-zA-Z0-9_]+" /tmp/databaseschema.sql /tmp/export/schema/*.sql 2>/dev/null | sed -E "s/create table\s+public\.//Ig" | sort -u > /tmp/expected_from_sql.txt || true'
docker exec "$CONTAINER_NAME" bash -lc 'cat /tmp/expected_from_csv.txt /tmp/expected_from_sql.txt 2>/dev/null | sort -u > /tmp/expected_tables.txt || true'

echo "Expected tables (from CSV + SQL):"
docker exec "$CONTAINER_NAME" bash -lc 'cat /tmp/expected_tables.txt 2>/dev/null || true'

echo "Actual tables (in DB):"
docker exec "$CONTAINER_NAME" bash -lc 'cat /tmp/actual_tables.txt 2>/dev/null || true'

echo "Missing tables (expected but not present):"
docker exec "$CONTAINER_NAME" bash -lc 'comm -23 <(cat /tmp/expected_tables.txt || true) <(cat /tmp/actual_tables.txt || true) || true'

echo "Cleaning up: stopping container $CONTAINER_NAME"
docker stop "$CONTAINER_NAME"

echo "Restore+verify finished. If you want to keep the container for debugging, don't run the script with --rm next time."

echo
echo "Running foreign-key orphan checks (if relevant tables exist):"
# run inside container before we stop it (but we already stopped it above). To allow checks, start and run in a new short-lived psql call to the container
container="$CONTAINER_NAME"
docker start "$container" >/dev/null || true
check_sql() {
  docker exec "$container" psql -U postgres -d "$PGDB" -t -A -c "$1" || echo "0"
}

# helper: report orphans for a FK relationship
report_orphans() {
  local child=$1; local fkcol=$2; local parent=$3; local parentcol=$4
  echo -n "$child:$fkcol -> $parent:$parentcol -> orphans="
  check_sql "SELECT count(*) FROM ${child} WHERE ${fkcol} IS NOT NULL AND ${fkcol} NOT IN (SELECT ${parentcol} FROM ${parent});"
}

report_orphans 'products' 'store_id' 'stores' 'store_id' || true
report_orphans 'stores' 'owner_id' 'users' 'user_id' || true
report_orphans 'transactions' 'product_id' 'products' 'id' || true
report_orphans 'transactions' 'store_id' 'stores' 'store_id' || true
report_orphans 'transactions' 'user_id' 'users' 'user_id' || true
report_orphans 'redemptions' 'reward_id' 'rewards' 'reward_id' || true
report_orphans 'redemptions' 'customer_id' 'users' 'user_id' || true
report_orphans 'user_points' 'user_id' 'users' 'user_id' || true
report_orphans 'user_points' 'store_id' 'stores' 'store_id' || true
report_orphans 'notifications' 'user_id' 'users' 'user_id' || true
report_orphans 'user_logs' 'user_id' 'users' 'user_id' || true

echo "Stopping container $container"
docker stop "$container" >/dev/null || true
