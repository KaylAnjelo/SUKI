#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-incremental}
ROOT=$(pwd)
OUTDIR="$ROOT/backup_artifacts"
mkdir -p "$OUTDIR"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)

if [ -z "${DB_HOST:-}" ] || [ -z "${DB_NAME:-}" ] || [ -z "${DB_USER:-}" ] || [ -z "${DB_PASS:-}" ]; then
  echo "Missing DB_* environment variables"
  exit 2
fi

export PGPASSWORD="$DB_PASS"

if [ "$MODE" = "full" ]; then
  SQLFILE="$OUTDIR/${DB_NAME}_full_${TIMESTAMP}.sql"
  echo "Running pg_dump full -> $SQLFILE"
  pg_dump --host "$DB_HOST" --port "${DB_PORT:-5432}" --username "$DB_USER" "$DB_NAME" > "$SQLFILE"
  ZIPFILE="$SQLFILE.zip"
  gzip -c "$SQLFILE" > "$ZIPFILE"
  echo "Uploading $ZIPFILE to s3://$S3_BUCKET/" && aws s3 cp "$ZIPFILE" "s3://$S3_BUCKET/" --only-show-errors
  echo "Uploaded: $ZIPFILE"
  exit 0
else
  # incremental: for simplicity export changed rows by timestamp candidates via psql COPY
  IFS=',' read -ra TABLE_ARR <<< "${TABLES:-}"
  OUTFILE="$OUTDIR/${DB_NAME}_incremental_${TIMESTAMP}.sql"
  echo "Running incremental exports for tables: ${TABLE_ARR[*]}"
  for t in "${TABLE_ARR[@]}"; do
    echo "Checking columns for $t"
    # try columns in order
    for col in modified_at updated_at created_at; do
      has=$(psql "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='$t' AND column_name='$col'" ) || true
      if [ "$has" = "1" ]; then
        echo "Found column $col on $t; exporting rows changed in last 24 hours"
        psql "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}" -c "COPY (SELECT * FROM \"$t\" WHERE \"$col\" >= now() - interval '1 day') TO STDOUT WITH CSV HEADER" > "$OUTDIR/${t}_${TIMESTAMP}.csv"
        echo "-- CSV export for $t" >> "$OUTFILE"
        echo "\COPY $t FROM '${OUTDIR}/${t}_${TIMESTAMP}.csv' CSV HEADER;" >> "$OUTFILE"
        break
      fi
    done
  done
  gzip -c "$OUTFILE" > "$OUTFILE.gz"
  aws s3 cp "$OUTFILE.gz" "s3://$S3_BUCKET/" --only-show-errors
  echo "Uploaded incremental: $OUTFILE.gz"
  exit 0
fi
