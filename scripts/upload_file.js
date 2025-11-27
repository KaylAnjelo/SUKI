// scripts/upload_file.js
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_BUCKET = process.env.BACKUP_BUCKET || 'backups';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('data', d => hash.update(d));
    rs.on('end', () => resolve(hash.digest('hex')));
    rs.on('error', reject);
  });
}

async function uploadFile(filePath, remoteKey) {
  const contentType = 'application/gzip';
  const buffer = fs.readFileSync(filePath);
  const { data, error } = await supabase.storage.from(BACKUP_BUCKET).upload(remoteKey, buffer, { upsert: true, contentType });
  if (error) throw error;
  return data;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: node scripts/upload_file.js <path-to-gzipped-dump>');
    process.exit(1);
  }

  const base = path.basename(filePath);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const remoteKey = `db/${base.replace(/\.gz$/, '')}-${ts}.sql.gz`;

  try {
    const checksum = await sha256File(filePath);
    console.log('Uploading', filePath, '->', remoteKey);
    await uploadFile(filePath, remoteKey);

    const meta = { timestamp: ts, file: remoteKey, checksum };
    const metaKey = `db/${path.basename(remoteKey)}.meta.json`;
    await supabase.storage.from(BACKUP_BUCKET).upload(metaKey, Buffer.from(JSON.stringify(meta)), { upsert: true, contentType: 'application/json' });

    const { data: signed, error: signedErr } = await supabase.storage.from(BACKUP_BUCKET).createSignedUrl(remoteKey, 60 * 60);
    if (signedErr) console.warn('Signed URL error', signedErr);
    else console.log('Signed URL (valid 1 hour):', signed.signedUrl);

    console.log('Upload complete. checksum:', checksum);
    process.exit(0);
  } catch (err) {
    console.error('Upload failed', err);
    process.exit(2);
  }
}

main();
