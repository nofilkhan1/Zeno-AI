import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REVIEW_INTERVALS = [1, 3, 7, 14] as const;

function getNextReviewInterval(lastReviewedAt: Date, now: Date): number {
  const daysSince = Math.floor((now.getTime() - lastReviewedAt.getTime()) / 86400000);
  for (const interval of REVIEW_INTERVALS) {
    if (daysSince < interval) return interval;
  }
  return 14;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const { action, surah, ayah, status, limit } = await req.json();

    if (action === 'get') {
      if (!surah || !ayah) {
        return new Response(JSON.stringify({ error: 'Missing surah or ayah' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const { data, error } = await supabase
        .from('memorization_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('surah', surah)
        .eq('ayah', ayah)
        .maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ progress: data }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'list-surah') {
      if (!surah) {
        return new Response(JSON.stringify({ error: 'Missing surah' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const { data, error } = await supabase
        .from('memorization_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('surah', surah);
      if (error) throw error;
      return new Response(JSON.stringify({ progress: data || [] }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'list-all') {
      const { data, error } = await supabase
        .from('memorization_progress')
        .select('surah, ayah, status, last_reviewed_at')
        .eq('user_id', user.id);
      if (error) throw error;
      return new Response(JSON.stringify({ progress: data || [] }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'update') {
      if (!surah || !ayah || !status) {
        return new Response(JSON.stringify({ error: 'Missing surah, ayah, or status' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from('memorization_progress')
        .select('id, last_reviewed_at, status')
        .eq('user_id', user.id)
        .eq('surah', surah)
        .eq('ayah', ayah)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('memorization_progress')
          .update({ status, last_reviewed_at: now, updated_at: now })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('memorization_progress')
          .insert({ user_id: user.id, surah, ayah, status, last_reviewed_at: now });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'update-range') {
      if (!surah || !ayah) {
        return new Response(JSON.stringify({ error: 'Missing surah or ayah' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const startAyah = ayah;
      const endAyah = status?.endAyah || ayah;
      const newStatus = status?.status || 'memorized';
      const now = new Date().toISOString();

      for (let a = startAyah; a <= endAyah; a++) {
        const { data: existing } = await supabase
          .from('memorization_progress')
          .select('id')
          .eq('user_id', user.id)
          .eq('surah', surah)
          .eq('ayah', a)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('memorization_progress')
            .update({ status: newStatus, last_reviewed_at: now, updated_at: now })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('memorization_progress')
            .insert({ user_id: user.id, surah, ayah: a, status: newStatus, last_reviewed_at: now });
        }
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'review-due') {
      const limitNum = limit || 50;
      const now = new Date();
      const { data, error } = await supabase
        .from('memorization_progress')
        .select('id, surah, ayah, last_reviewed_at')
        .eq('user_id', user.id)
        .eq('status', 'memorized')
        .lte('last_reviewed_at', now.toISOString())
        .order('last_reviewed_at', { ascending: true });
      if (error) throw error;

      const due: { surah: number; ayah: number; daysOverdue: number }[] = [];
      for (const row of data || []) {
        const lastReview = new Date(row.last_reviewed_at);
        const daysSince = Math.floor((now.getTime() - lastReview.getTime()) / 86400000);
        const interval = getNextReviewInterval(lastReview, now);
        if (daysSince >= interval) {
          due.push({ surah: row.surah, ayah: row.ayah, daysOverdue: daysSince - interval });
          if (due.length >= limitNum) break;
        }
      }

      return new Response(JSON.stringify({ due }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'stats') {
      const surahFilter = surah ? `surah.eq.${surah}` : '';
      let query = supabase
        .from('memorization_progress')
        .select('surah, ayah, status')
        .eq('user_id', user.id);
      if (surah) query = query.eq('surah', surah);
      const { data, error } = await query;
      if (error) throw error;

      const memorized = (data || []).filter(r => r.status === 'memorized').length;
      const inProgress = (data || []).filter(r => r.status === 'in_progress').length;

      const surahsMap = new Map<number, { memorized: number; total: number }>();
      for (const row of data || []) {
        if (!surahsMap.has(row.surah)) {
          surahsMap.set(row.surah, { memorized: 0, total: 0 });
        }
        const entry = surahsMap.get(row.surah)!;
        if (row.status === 'memorized') entry.memorized++;
        entry.total++;
      }

      return new Response(JSON.stringify({
        totalMemorized: memorized,
        totalInProgress: inProgress,
        perSurah: Object.fromEntries(surahsMap),
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Memorization] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
