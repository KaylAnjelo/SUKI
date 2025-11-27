import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'child_process';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_BUCKET = process.env.BACKUP_BUCKET || 'backups';
const PAGE_SIZE = parseInt(process.env.EXPORT_PAGE_SIZE || '1000', 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') value = JSON.stringify(value);
  const s = String(value);
  if (s.includes('"')) {
    // escape quotes by doubling
    const out = '"' + s.replace(/"/g, '""') + '"';
    return out;
  }
  if (s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s + '"';
  }
  return s;
}

async function listTables() {
  // Try querying information_schema via PostgREST. If that fails (some projects
  // or client versions don't expose withSchema), fall back to reading the
  // TABLES env var (comma-separated). This is safer for environments where
  // information_schema isn't reachable via the REST client.
  try {
    const { data, error } = await supabase
      .from('tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
    if (error) throw error;
    return data.map((r) => r.table_name).sort();
  } catch (err) {
    const envTables = process.env.TABLES;
    if (envTables) {
      console.warn('Falling back to TABLES env var for table list');
      return envTables.split(',').map((s) => s.trim()).filter(Boolean);
    }
    // As a last resort, try to read a local databaseschema.sql and extract
    // table names declared with `create table public.<name>` so we can export
    // everything without information_schema access.
    try {
      const schemaPath = path.join(process.cwd(), 'databaseschema.sql');
      if (fs.existsSync(schemaPath)) {
        console.warn('Falling back to parsing local databaseschema.sql for table list');
        const txt = fs.readFileSync(schemaPath, 'utf8');
        // match `create table public.<name>` ignoring case
        const re = /create\s+table\s+public\.([a-zA-Z0-9_]+)/ig;
        const set = new Set();
        let m;
        while ((m = re.exec(txt)) !== null) set.add(m[1]);
        const tables = Array.from(set).sort();
        if (tables.length > 0) return tables;
      }
    } catch (e) {
      console.warn('Parsing databaseschema.sql failed:', e.message || e);
    }
    throw new Error('Failed to list tables via information_schema and no TABLES env var or databaseschema.sql found: ' + (err.message || err));
  }
}

async function getColumns(table) {
  try {
    const { data, error } = await supabase
      .from('columns')
      .select('column_name,data_type,is_nullable,column_default,character_maximum_length,ordinal_position')
      .eq('table_name', table)
      .order('ordinal_position', { ascending: true });
    if (error) throw error;
    return data;
  } catch (err) {
    // If information_schema access fails, attempt to infer columns from the
    // first row of the table using `select('*').limit(1)`. This makes the
    // exporter work in projects where information_schema isn't publicly
    // exposed by PostgREST. Inferred columns will be treated as TEXT.
    console.warn(`Could not fetch columns for table ${table}: ${err.message || err}`);
    try {
      const { data: sample, error: sampleErr } = await supabase.from(table).select('*').limit(1);
      if (sampleErr) {
        console.warn(`Could not fetch a sample row for ${table}: ${sampleErr.message || sampleErr}`);
        return [];
      }
      if (!sample || sample.length === 0) {
        // try to parse columns from local databaseschema.sql as a last resort
        const parsed = parseColumnsFromDatabaseschema(table);
        if (parsed && parsed.length) {
          console.log(`Parsed ${parsed.length} columns for ${table} from databaseschema.sql`);
          return parsed;
        }
        return [];
      }
      const keys = Object.keys(sample[0]);
      // Build a minimal colsMeta array compatible with existing code
      const inferred = keys.map((k, idx) => ({
        column_name: k,
        data_type: 'text',
        is_nullable: 'YES',
        column_default: null,
        character_maximum_length: null,
        ordinal_position: idx + 1,
      }));
      console.log(`Inferred ${inferred.length} columns for ${table}`);
      return inferred;
    } catch (e) {
      console.warn(`Inference failed for ${table}: ${e.message || e}`);
      return [];
    }
  }
}

async function exportTableCsv(table, outDir) {
  const colsMeta = await getColumns(table);
  const cols = colsMeta.map((c) => c.column_name);
  const outPath = path.join(outDir, `${table}.csv`);
  const ws = fs.createWriteStream(outPath, { encoding: 'utf8' });
  // header
  ws.write(cols.join(',') + '\n');

  let start = 0;
  while (true) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase.from(table).select(cols.join(',')).range(start, end);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const line = cols.map((c) => escapeCsv(row[c])).join(',') + '\n';
      ws.write(line);
    }
    start += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }
  ws.end();
  return outPath;
}

function buildCreateTableSql(table, colsMeta) {
  const parts = colsMeta.map((c) => {
    let type = c.data_type;
    if (c.character_maximum_length && (type === 'character varying' || type === 'varchar')) {
      type = `${type}(${c.character_maximum_length})`;
    }
    let def = `\"${c.column_name}\" ${type}`;
    if (c.is_nullable === 'NO') def += ' NOT NULL';
    if (c.column_default !== null) def += ` DEFAULT ${c.column_default}`;
    return def;
  });
  return `CREATE TABLE public.${table} (\n  ${parts.join(',\n  ')}\n);\n`;
}

function parseColumnsFromDatabaseschema(table) {
  try {
    const schemaPath = path.join(process.cwd(), 'databaseschema.sql');
    if (!fs.existsSync(schemaPath)) return [];
    const txt = fs.readFileSync(schemaPath, 'utf8');
    // Find the create table block for the table
    const re = new RegExp('create\\s+table\\s+public\\.' + table + '\\s*\\(([^;]+?)\\)\\s*', 'is');
    const m = re.exec(txt);
    if (!m) return [];
    const body = m[1];
    const lines = body.split(/,\n/);
    const cols = [];
    for (let ln of lines) {
      // remove comments and trim
      ln = ln.replace(/--.*$/g, '').trim();
      if (!ln) continue;
      // match `column_name type` — allow quoted or unquoted column
      const cm = ln.match(/^\s*"?([a-zA-Z0-9_]+)"?\s+([a-zA-Z0-9_\(\) ,]+)(.*)$/i);
      if (cm) {
        const name = cm[1];
        let type = cm[2].trim();
        // normalize some types
        if (/character varying/i.test(type)) type = 'character varying';
        if (/timestamp/i.test(type)) type = 'timestamp';
        cols.push({
          column_name: name,
          data_type: type,
          is_nullable: /not null/i.test(ln) ? 'NO' : 'YES',
          column_default: null,
          character_maximum_length: null,
          ordinal_position: cols.length + 1,
        });
      }
    }
    return cols;
  } catch (e) {
    console.warn('parseColumnsFromDatabaseschema error:', e.message || e);
    return [];
  }
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tmpRoot = path.join(process.cwd(), 'tmp', `export-${ts}`);
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dataDir = path.join(tmpRoot, 'data');
  const schemaDir = path.join(tmpRoot, 'schema');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(schemaDir, { recursive: true });

  console.log('Listing tables...');
  const tables = await listTables();
  console.log('Found tables:', tables.join(', '));

  for (const t of tables) {
    console.log('Exporting table', t);
    await exportTableCsv(t, dataDir);
    const colsMeta = await getColumns(t);
    const createSql = buildCreateTableSql(t, colsMeta);
    fs.writeFileSync(path.join(schemaDir, `${t}.sql`), createSql, 'utf8');
  }
  
    // include top-level databaseschema.sql (if present) so archive contains full original schema
    const topSchemaPath = path.join(process.cwd(), 'databaseschema.sql');
    if (fs.existsSync(topSchemaPath)) {
      fs.copyFileSync(topSchemaPath, path.join(tmpRoot, 'databaseschema.sql'));
    }

  // create a tar.gz archive using system tar
  const archiveName = `supabase-export-${ts}.tar.gz`;
  console.log('Archiving to', archiveName);
  const tarArgs = ['-czf', archiveName, '-C', tmpRoot, '.'];
  const tar = spawnSync('tar', tarArgs, { stdio: 'inherit' });
  if (tar.error) {
    console.error('tar failed:', tar.error.message);
    process.exit(2);
  }

  // checksum
  const buf = fs.readFileSync(archiveName);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  fs.writeFileSync(`${archiveName}.sha256`, `${sha}  ${archiveName}\n`);

  console.log('Archive created:', archiveName, 'sha256:', sha);

  // upload using existing node uploader script
  console.log('Uploading archive...');
  const upload = spawnSync('node', ['scripts/upload_file.js', archiveName], { stdio: 'inherit' });
  if (upload.status !== 0) {
    console.error('Upload failed');
    process.exit(3);
  }

  console.log('Export + upload complete. Temporary files left under', tmpRoot);
}

main().catch((err) => {
  console.error('Export failed:', err.message || err);
  process.exit(1);
});
