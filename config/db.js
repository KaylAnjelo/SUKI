import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  const missing = [
    !SUPABASE_URL ? 'SUPABASE_URL' : null,
    !SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : null
  ].filter(Boolean).join(', ');
  throw new Error(`Missing required environment variables: ${missing}. Check your .env file.`);
}

// Basic sanity check to avoid common mistakes
if (!/^https?:\/\//.test(SUPABASE_URL)) {
  throw new Error('SUPABASE_URL must start with http(s)://');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default supabase;
