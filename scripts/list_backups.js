// scripts/list_backups.js
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_BUCKET = process.env.BACKUP_BUCKET || 'backups';
const PREFIX = process.argv[2] || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  try {
    console.log(`Listing bucket '${BACKUP_BUCKET}' prefix '${PREFIX}' on project ${SUPABASE_URL}`);
    const { data, error } = await supabase.storage.from(BACKUP_BUCKET).list(PREFIX, { limit: 1000 });
    if (error) {
      console.error('Error listing storage:', error);
      process.exit(2);
    }
    console.log(`Found ${data.length} items:`);
    data.forEach(item => console.log('-', item.name || item.id, item.metadata || ''));
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error', err);
    process.exit(3);
  }
})();
