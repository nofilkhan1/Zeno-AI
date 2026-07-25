"""
Batch-embed all 6236 Quran verses (Sahih International) using NVIDIA NIM
via the quran-embed edge function, then insert into quran_embeddings table.

Usage: python embed_quran.py
Requirements: pip install httpx
"""

import httpx
import json
import sys
import time
import math

SUPABASE_URL = "https://nnlveodbfvjermbpxpid.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ubHZlb2RiZnZqZXJtYnB4cGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MzcxODUsImV4cCI6MjEwMDExMzE4NX0.wh_dIKCHjT15Q3Z9GlH-VkXjMpdcAF1Gryy9v8jjmQY"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ubHZlb2RiZnZqZXJtYnB4cGlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDUzNzE4NSwiZXhwIjoyMTAwMTEzMTg1fQ._VxeqS7Un-0hy3cYgtXFD7YOYlFvaJQYJmjhJYHXocY"

BATCH_SIZE = 100  # quran-embed max batch
VERSE_LIMIT = 100  # how many verses to fetch per UmmahAPI request


def get_auth_token(client: httpx.Client) -> str:
    """Create a temp user and get auth token for edge function calls."""
    ts = int(time.time() * 1000)
    email = f"emb{ts}@x.com"
    password = "Emb12345!"
    r = client.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        json={"email": email, "password": password},
        headers={"apikey": ANON_KEY},
    )
    data = r.json()
    token = data.get("access_token")
    if not token:
        print(f"[ERROR] No auth token: {data}", flush=True)
        sys.exit(1)
    return token


def fetch_all_verses(client: httpx.Client) -> list[dict]:
    """Fetch all 6236 Quran verses with Sahih International translation."""
    all_verses = []
    # Fetch surah list
    surahs_url = "https://ummahapi.com/api/quran/surahs"
    r = client.get(surahs_url)
    data = r.json()
    surahs_list = data.get("data", {}).get("surahs", [])
    if not surahs_list:
        print(f"[ERROR] No surahs found: {json.dumps(data)[:300]}", flush=True)
        sys.exit(1)

    print(f"[INFO] Found {len(surahs_list)} surahs", flush=True)

    # Parse surah numbers from the list
    surah_numbers = []
    for s in surahs_list:
        if isinstance(s, dict):
            snum = s.get("number")
        else:
            snum = None
        if snum:
            surah_numbers.append(snum)

    print(f"[INFO] Parsed {len(surah_numbers)} surah numbers", flush=True)

    for surah_num in surah_numbers:
        url = f"https://ummahapi.com/api/quran/surah/{surah_num}?translation=sahih_international"
        r = client.get(url)
        sdata = r.json()
        if not sdata.get("success"):
            print(f"[WARN] Failed to fetch surah {surah_num}: {json.dumps(sdata)[:200]}", flush=True)
            continue
        surah_info = sdata.get("data", {}).get("surah", {})
        verses = sdata.get("data", {}).get("verses", [])
        name_en = surah_info.get("name_english", f"Surah {surah_num}")
        for v in verses:
            all_verses.append({
                "surah": int(v.get("surah_number", surah_num)),
                "ayah": int(v.get("ayah", v.get("verse_number", 0))),
                "text": v.get("translation", v.get("text", "")),
                "arabic": v.get("arabic", ""),
            })
        print(f"[INFO] Fetched surah {surah_num} ({name_en}) — {len(verses)} verses", flush=True)

    print(f"[INFO] Total verses fetched: {len(all_verses)}", flush=True)
    return all_verses


def embed_batch(client: httpx.Client, texts: list[str], token: str) -> list[list[float]]:
    """Call quran-embed edge function for a batch of texts."""
    r = client.post(
        f"{SUPABASE_URL}/functions/v1/quran-embed",
        json={"texts": texts, "input_type": "passage"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=120,
    )
    data = r.json()
    if r.status_code != 200 or "error" in data:
        print(f"[ERROR] Embed failed: {json.dumps(data)[:300]}", flush=True)
        raise Exception(data.get("error", f"HTTP {r.status_code}"))
    return data["embeddings"]


def insert_batch(client: httpx.Client, rows: list[dict]):
    """Insert a batch of verses + embeddings via Supabase REST API."""
    r = client.post(
        f"{SUPABASE_URL}/rest/v1/quran_embeddings",
        json=rows,
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        timeout=60,
    )
    if r.status_code not in (200, 201):
        print(f"[ERROR] Insert failed ({r.status_code}): {r.text[:300]}", flush=True)
        return False
    return True


def main():
    client = httpx.Client(timeout=60)
    
    print("[INFO] Getting auth token...", flush=True)
    token = get_auth_token(client)
    print("[INFO] Auth token obtained", flush=True)

    print("[INFO] Fetching all Quran verses...", flush=True)
    verses = fetch_all_verses(client)
    if not verses:
        print("[ERROR] No verses to process", flush=True)
        sys.exit(1)

    total = len(verses)
    print(f"[INFO] Processing {total} verses in batches of {BATCH_SIZE}", flush=True)
    
    # Prepare all rows with embeddings
    all_rows = []
    batch_texts = []
    batch_indices = []

    for i, v in enumerate(verses):
        text = v["text"].strip()
        if not text:
            text = v.get("arabic", "")
        batch_texts.append(text)
        batch_indices.append(i)

        if len(batch_texts) >= BATCH_SIZE or i == total - 1:
            print(f"[PROGRESS] Embedding batch {len(all_rows) + len(batch_texts)}/{total}...", flush=True)
            try:
                embeddings = embed_batch(client, batch_texts, token)
            except Exception as e:
                print(f"[ERROR] Batch failed, retrying once after 5s: {e}", flush=True)
                time.sleep(5)
                # Get a fresh token (old one may have expired)
                token = get_auth_token(client)
                embeddings = embed_batch(client, batch_texts, token)

            for j, idx in enumerate(batch_indices):
                v = verses[idx]
                all_rows.append({
                    "surah": v["surah"],
                    "ayah": v["ayah"],
                    "translation_text": batch_texts[j],
                    "embedding": embeddings[j],
                })

            batch_texts = []
            batch_indices = []

            # Rate limit: short pause between batches
            time.sleep(0.5)

    print(f"[INFO] Total rows to insert: {len(all_rows)}", flush=True)

    # Insert in batches of 50 via REST API
    INSERT_BATCH = 50
    inserted = 0
    for i in range(0, len(all_rows), INSERT_BATCH):
        batch = all_rows[i:i + INSERT_BATCH]
        success = insert_batch(client, batch)
        if success:
            inserted += len(batch)
        if i % 500 == 0 or not success:
            print(f"[PROGRESS] Inserted {inserted}/{len(all_rows)} rows", flush=True)
        if not success:
            print(f"[ERROR] Insert failed at row {i}, continuing...", flush=True)
            continue

    print(f"[DONE] Successfully inserted {inserted} rows into quran_embeddings", flush=True)

    # Verify final count
    r = client.get(
        f"{SUPABASE_URL}/rest/v1/quran_embeddings?select=count",
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        },
    )
    print(f"[VERIFY] Final row count: {r.json()}", flush=True)

    # Show a sample
    r = client.get(
        f"{SUPABASE_URL}/rest/v1/quran_embeddings?select=surah,ayah,translation_text&limit=3",
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        },
    )
    print(f"[SAMPLE] First 3 rows:", flush=True)
    for row in r.json():
        print(f"  {row['surah']}:{row['ayah']} — {row['translation_text'][:80]}...", flush=True)


if __name__ == "__main__":
    main()
