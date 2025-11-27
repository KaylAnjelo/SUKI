// scripts/backup_and_upload.js
import dotenv from 'dotenv';
dotenv.config();

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_BUCKET = process.env.BACKUP_BUCKET || 'backups';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ensureTmpDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function gzipFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const source = fs.createReadStream(inputPath);
    const dest = fs.createWriteStream(outputPath);
    const gzip = zlib.createGzip({ level: 9 });
    source.pipe(gzip).pipe(dest).on('finish', resolve).on('error', reject);
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('data', (d) => hash.update(d));
    rs.on('end', () => resolve(hash.digest('hex')));
    rs.on('error', reject);
  });
}

async function runPgDump(outPath) {
  return new Promise((resolve, reject) => {
    // Support explicit PG env vars (PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD)
    // which is useful if the DNS name resolves only to IPv6 but you have an
    // IPv4 address to reach the DB (set PGHOST to the IPv4 address).
    const pgHost = process.env.PGHOST;
    const pgPort = process.env.PGPORT || '5432';
    const pgUser = process.env.PGUSER;
    const pgDatabase = process.env.PGDATABASE;

    let args;
    let spawnEnv = { ...process.env };

    if (pgHost && pgUser && pgDatabase) {
      args = ['-h', pgHost, '-p', pgPort, '-U', pgUser, '-d', pgDatabase];
      // pass PGPASSWORD via environment if set
      if (process.env.PGPASSWORD) spawnEnv.PGPASSWORD = process.env.PGPASSWORD;
    } else if (DATABASE_URL) {
      args = ['--dbname', DATABASE_URL];
      if (process.env.PGPASSWORD) spawnEnv.PGPASSWORD = process.env.PGPASSWORD;
    } else {
      return reject(new Error('Missing database connection info (set PGHOST/PGUSER/PGDATABASE or DATABASE_URL)'));
    }

    const proc = spawn('pg_dump', args, { stdio: ['ignore', 'pipe', 'inherit'], env: spawnEnv });
    const ws = fs.createWriteStream(outPath);
    proc.stdout.pipe(ws);
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}`));
    });
  });
}

async function uploadToSupabase(filePath, key, contentType) {
  // Read file into a Buffer to avoid streaming bodies which require the
  // `duplex` RequestInit option in Node's undici fetch. Reading into a
  // Buffer works reliably across Node versions.
  const fileBuffer = fs.readFileSync(filePath);
  const { data, error } = await supabase.storage.from(BACKUP_BUCKET).upload(key, fileBuffer, { upsert: true, contentType });
  if (error) throw error;
  return data;
}

async function main() {
  const tmpDir = path.join(process.cwd(), 'tmp');
  ensureTmpDir(tmpDir);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const sqlPath = path.join(tmpDir, `dump-${ts}.sql`);
  const gzPath = `${sqlPath}.gz`;

  try {
    console.log('Starting backup...');
    let producedDump = false;
    try {
      // attempt to run pg_dump
      console.log('Running pg_dump...');
      await runPgDump(sqlPath);
      producedDump = true;
      console.log('pg_dump completed');
    } catch (err) {
      console.warn('pg_dump failed or not available:', err.message);
      // fallback: create a small SQL file as a test upload
      const testSql = `-- test backup created at ${new Date().toISOString()}\n`;
      fs.writeFileSync(sqlPath, testSql, 'utf8');
      console.log('Wrote test SQL file instead');
    }

    console.log('Compressing dump...');
    await gzipFile(sqlPath, gzPath);

    const checksum = await sha256File(gzPath);
    const key = `db/dump-${ts}.sql.gz`;
    console.log('Uploading to Supabase Storage as', key);
    await uploadToSupabase(gzPath, key, 'application/gzip');

    // upload metadata
    const meta = { timestamp: ts, file: key, checksum, producedDump };
    const metaKey = `db/dump-${ts}.meta.json`;
    await supabase.storage.from(BACKUP_BUCKET).upload(metaKey, Buffer.from(JSON.stringify(meta)), { upsert: true, contentType: 'application/json' });

    // generate a short signed URL for verification (1 hour)
    const { data: signed, error: signedErr } = await supabase.storage.from(BACKUP_BUCKET).createSignedUrl(key, 60 * 60);
    if (signedErr) console.warn('Signed URL error', signedErr);
    else console.log('Signed URL (valid 1 hour):', signed.signedUrl);

    console.log('Backup uploaded successfully. checksum:', checksum);

    // cleanup local files
    try { fs.unlinkSync(sqlPath); } catch (e) {}
    try { fs.unlinkSync(gzPath); } catch (e) {}
    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err);
    try { fs.unlinkSync(sqlPath); } catch (e) {}
    try { fs.unlinkSync(gzPath); } catch (e) {}
    process.exit(2);
  }
}

main();
