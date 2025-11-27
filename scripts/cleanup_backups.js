// scripts/cleanup_backups.js (ESM)
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

// read env after dotenv.config()
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_BUCKET = process.env.BACKUP_BUCKET || 'backups';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const PREFIXES = ['db/', 'assets/']; // folders in storage to clean

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Extract an ISO-like timestamp from a filename.
 * Expects something like: dump-2025-11-26T02-00-00.sql.gz or dump-2025-11-26T02:00:00.sql.gz
 */
function parseTimestampFromName(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2}T[0-9:\-]{8,12})/);
  if (!m) return null;
  // Convert any hyphenated time parts back to colon form if needed:
  let ts = m[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

async function cleanupOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
  for (const prefix of PREFIXES) {
    // list objects under the prefix
    const { data: items, error } = await supabase.storage.from(BACKUP_BUCKET).list(prefix, { limit: 1000 });
    if (error) {
      console.error('List error for prefix', prefix, error);
      continue;
    }
    for (const item of items) {
      // in current SDK item.name is usually the filename
      const name = item.name || item.id || '';
      const ts = parseTimestampFromName(name);
      if (!ts) continue; // skip files without parseable timestamp
      if (ts.getTime() < cutoff) {
        const pathToDelete = `${prefix}${name}`;
        const { error: delErr } = await supabase.storage.from(BACKUP_BUCKET).remove([pathToDelete]);
        if (delErr) console.warn('Delete failed', pathToDelete, delErr);
        else console.log('Deleted old backup', pathToDelete);
      }
    }
  }
}

cleanupOldBackups().catch(err => {
  console.error('Cleanup failed', err);
  process.exit(2);
});