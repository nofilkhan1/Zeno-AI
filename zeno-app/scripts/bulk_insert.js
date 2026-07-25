// Bulk insert remaining Quran embeddings using Supabase JS client
// Reads the SQL file and inserts via supabase-js

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = 'https://nnlveodbfvjermbpxpid.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ubHZlb2RiZnZqZXJtYnB4cGlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDUzNzE4NSwiZXhwIjoyMTAwMTEzMTg1fQ._VxeqS7Un-0hy3cYgtXFD7YOYlFvaJQYJmjhJYHXocY';

const sqlFile = path.join(process.cwd(), 'scripts', 'insert_embeddings.sql');
const BATCH_SIZE = 200; // rows per batch
const MAX_PARALLEL = 3; // concurrent batches

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function parseSQLFile(filepath) {
  console.log(`Reading ${filepath}...`);
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  
  // Skip header (line 0) and parse data lines
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === ';') continue;
    
    // Parse: (surah, ayah, 'text', '[...]'::vector),
    const match = line.match(/^\((\d+),\s*(\d+),\s*'(.*)'\s*,\s*'\[(.*?)\]'::vector\),?;?$/);
    if (match) {
      const surah = parseInt(match[1], 10);
      const ayah = parseInt(match[2], 10);
      let text = match[3];
      // Unescape single quotes: '' -> '
      text = text.replace(/''/g, "'");
      const embedding = match[4].split(',').map(Number);
      
      rows.push({ surah, ayah, translation_text: text, embedding });
    }
  }
  
  console.log(`Parsed ${rows.length} rows from SQL file`);
  return rows;
}

async function insertBatch(batch) {
  const { error } = await supabase
    .from('quran_embeddings')
    .upsert(batch, { onConflict: 'surah,ayah', ignoreDuplicates: false });
  
  if (error) {
    throw new Error(`Insert failed: ${error.message}`);
  }
  return batch.length;
}

async function main() {
  console.log('[INFO] Starting bulk insert...');
  const allRows = parseSQLFile(sqlFile);
  
  // Get existing rows to skip
  console.log('[INFO] Checking existing rows in DB...');
  const { data: existing, error: existErr } = await supabase
    .from('quran_embeddings')
    .select('surah, ayah');
  
  if (existErr) {
    console.error('[ERROR] Failed to fetch existing:', existErr);
    return;
  }
  
  const existingSet = new Set(existing.map(r => `${r.surah}:${r.ayah}`));
  console.log(`[INFO] ${existing.size} rows already in DB`);
  
  // Filter to only new rows
  const newRows = allRows.filter(r => !existingSet.has(`${r.surah}:${r.ayah}`));
  console.log(`[INFO] ${newRows.length} new rows to insert`);
  
  if (newRows.length === 0) {
    console.log('[DONE] No new rows to insert');
    return;
  }
  
  // Process in parallel batches
  const batches = [];
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    batches.push(newRows.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`[INFO] ${batches.length} batches of ${BATCH_SIZE} rows`);
  
  let inserted = 0;
  let failed = 0;
  
  for (let i = 0; i < batches.length; i += MAX_PARALLEL) {
    const chunk = batches.slice(i, i + MAX_PARALLEL);
    console.log(`[PROGRESS] Processing batches ${i+1}-${Math.min(i+MAX_PARALLEL, batches.length)} / ${batches.length}`);
    
    const promises = chunk.map(async (batch, idx) => {
      try {
        await insertBatch(batch);
        return batch.length;
      } catch (e) {
        console.error(`[ERROR] Batch ${i + idx + 1} failed:`, e.message);
        return 0;
      }
    });
    
    const results = await Promise.all(promises);
    inserted += results.reduce((a, b) => a + b, 0);
  }
  
  console.log(`[DONE] Inserted ${inserted} rows. Failed: ${failed}`);
  
  // Verify final count
  const { count, error: countErr } = await supabase
    .from('quran_embeddings')
    .select('*', { count: 'exact', head: true });
  
  if (!countErr) {
    console.log(`[VERIFY] Total rows in quran_embeddings: ${count}`);
  }
  
  // Show sample
  const { data: sample } = await supabase
    .from('quran_embeddings')
    .select('surah, ayah, translation_text')
    .limit(3);
  
  console.log('[SAMPLE] First 3 rows:');
  sample?.forEach(r => console.log(`  ${r.surah}:${r.ayah} — ${r.translation_text.substring(0, 80)}...`));
}

main().catch(console.error);