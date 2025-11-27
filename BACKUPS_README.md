**Backups (demo) — Quick Guide**

This project includes a helper script to create Postgres SQL dumps using a dockerized `pg_dump`, verify the dump, and upload it to your Supabase Storage bucket.

Prerequisites
- Docker installed on the host where you run the script.
- Node.js available for the upload script (`node scripts/upload_file.js`).
- Network access to the database host (note: some Supabase hosts are IPv6-only).

How to run (example, from the project root)

1. Export connection details (example):

```bash
export DBHOST=db.czscuaoinqgolqraaqut.supabase.co
export DBPORT=5432
export DBUSER=postgres
export DBPASS=ZetvUmmf8i9sO0lR
export DBNAME=postgres
```

2. Run the helper:

```bash
./scripts/docker_pg_dump.sh
```

What the script does
- Runs `pg_dump` inside the official `postgres:17` image and writes `backup-<timestamp>.sql` to the current folder.
- Compresses the SQL to `backup-<timestamp>.sql.gz` and writes a SHA256 checksum file.
- Verifies the gzip is not tiny and contains `CREATE TABLE` or `COPY` statements.
- Uploads the gz file using `node scripts/upload_file.js` (must be present).

If your machine cannot reach an IPv6-only Supabase host, run the script on a cloud VM that has IPv6 support, or create an SSH tunnel through an IPv6-capable host and run the script locally using the forwarded port.

Safety notes
- The script will abort if the dump appears too small or does not contain schema markers.
- Do not commit secrets into git. Use environment variables or CI secrets for production.
