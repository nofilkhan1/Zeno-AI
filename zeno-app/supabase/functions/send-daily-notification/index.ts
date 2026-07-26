import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ummahApiKey = Deno.env.get('UMMAH_API_KEY');

const UMMAH_BASE = 'https://ummahapi.com';
const TOTAL_VERSES = 6236;

const SURAH_COUNTS: Record<number, number> = {
  1:7,2:286,3:200,4:176,5:120,6:165,7:206,8:75,9:129,10:109,
  11:123,12:111,13:43,14:52,15:99,16:128,17:111,18:110,19:98,20:135,
  21:112,22:78,23:118,24:64,25:77,26:227,27:93,28:88,29:69,30:60,
  31:34,32:30,33:73,34:54,35:45,36:83,37:182,38:88,39:75,40:85,
  41:54,42:53,43:89,44:59,45:37,46:35,47:38,48:29,49:18,50:45,
  51:60,52:49,53:62,54:55,55:78,56:96,57:29,58:22,59:24,60:13,
  61:14,62:11,63:11,64:18,65:12,66:12,67:30,68:52,69:52,70:44,
  71:28,72:28,73:20,74:56,75:40,76:31,77:50,78:40,79:46,80:42,
  81:29,82:19,83:36,84:25,85:22,86:17,87:19,88:26,89:30,90:20,
  91:15,92:21,93:11,94:8,95:8,96:19,97:5,98:8,99:8,100:11,
  101:11,102:8,103:3,104:9,105:5,106:4,107:7,108:3,109:6,110:3,
  111:5,112:4,113:5,114:6,
};

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

function getDailyVerseKey(dayOfYear: number): string {
  const verseIndex = (dayOfYear - 1) % TOTAL_VERSES;
  let surah = 1;
  let ayah = verseIndex + 1;
  let accumulated = 0;
  for (let s = 1; s <= 114; s++) {
    const c = SURAH_COUNTS[s] || 0;
    if (ayah <= accumulated + c) {
      surah = s;
      ayah = ayah - accumulated;
      break;
    }
    accumulated += c;
  }
  return `${surah}:${ayah}`;
}

function getDailyDuaId(dayOfYear: number): number {
  return ((dayOfYear - 1) % 126) + 1;
}

Deno.serve(async (req) => {
  const dayOfYear = getDayOfYear();

  if (req.method === 'GET') {
    const [verse, dua] = await Promise.all([
      fetchDailyVerse(dayOfYear),
      fetchDailyDua(dayOfYear),
    ]);
    return new Response(JSON.stringify({
      dayOfYear,
      verseKey: getDailyVerseKey(dayOfYear),
      duaId: getDailyDuaId(dayOfYear),
      verse,
      dua,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Server config missing' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const testUserId = body.test_user_id as string | undefined;

    const [verse, dua] = await Promise.all([
      fetchDailyVerse(dayOfYear),
      fetchDailyDua(dayOfYear),
    ]);

    let tokenQuery = supabase
      .from('push_tokens')
      .select('token, platform, user_id');

    if (testUserId) {
      tokenQuery = tokenQuery.eq('user_id', testUserId);
    }

    const { data: tokens, error: tokenError } = await tokenQuery;
    if (tokenError) {
      console.error('Error fetching push tokens:', tokenError);
      return new Response(JSON.stringify({ error: 'Failed to fetch push tokens' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No push tokens found', notificationsSent: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    let notificationTitles: string[] = [];
    if (verse) {
      notificationTitles.push(`📖 Verse: ${verse.surahName} ${verse.verseKey}`);
    }
    if (dua) {
      notificationTitles.push(`🤲 Dua: ${dua.title}`);
    }
    if (notificationTitles.length === 0) {
      return new Response(JSON.stringify({ error: 'Failed to fetch daily content' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const title = notificationTitles.join(' • ');

    let bodyParts: string[] = [];
    if (verse && verse.translation) {
      bodyParts.push(verse.translation.length > 120 ? verse.translation.slice(0, 117) + '...' : verse.translation);
    }
    if (dua && dua.translation) {
      const truncated = dua.translation.length > 100 ? dua.translation.slice(0, 97) + '...' : dua.translation;
      bodyParts.push(`Dua: ${truncated}`);
    }
    const notificationBody = bodyParts.join('\n');

    let sentCount = 0;
    let failCount = 0;

    for (const t of tokens) {
      const message = {
        to: t.token,
        sound: 'default',
        title,
        body: notificationBody,
        data: {
          type: 'daily_notification',
          screen: 'today',
          verseKey: verse?.verseKey || '',
          duaId: String(dua ? getDailyDuaId(dayOfYear) : ''),
        },
        priority: 'high' as const,
      };
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
        if (res.ok) {
          sentCount++;
        } else {
          const errText = await res.text();
          console.error(`Expo push error: ${res.status} ${errText.slice(0, 200)}`);
          failCount++;
        }
      } catch (err) {
        console.error(`Expo push exception: ${err instanceof Error ? err.message : String(err)}`);
        failCount++;
      }
    }

    return new Response(JSON.stringify({
      message: `Sent: ${sentCount}, failed: ${failCount}`,
      notificationsSent: sentCount,
      notificationsFailed: failCount,
      dayOfYear,
      verseKey: verse?.verseKey || null,
      duaId: dua ? getDailyDuaId(dayOfYear) : null,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

async function fetchDailyVerse(dayOfYear: number): Promise<{ verseKey: string; arabic: string; translation: string; surahName: string } | null> {
  const verseKey = getDailyVerseKey(dayOfYear);
  const [surah, ayah] = verseKey.split(':');
  const url = `${UMMAH_BASE}/api/quran/surah/${surah}/ayah/${ayah}`;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) headers['x-api-key'] = ummahApiKey;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !data.data?.verse) return null;
    const v = data.data.verse;
    return {
      verseKey,
      arabic: v.arabic || '',
      translation: v.translations?.sahih_international || '',
      surahName: data.data.surah?.name_english || '',
    };
  } catch {
    return null;
  }
}

async function fetchDailyDua(dayOfYear: number): Promise<{ title: string; arabic: string; translation: string; transliteration: string; source: string } | null> {
  const duaId = getDailyDuaId(dayOfYear);
  const url = `${UMMAH_BASE}/api/duas/${duaId}`;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) headers['x-api-key'] = ummahApiKey;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const dua = data.data;
    if (!dua) return null;
    return {
      title: dua.title || '',
      arabic: dua.arabic || '',
      translation: dua.translation || '',
      transliteration: dua.transliteration || '',
      source: dua.source || '',
    };
  } catch {
    return null;
  }
}
