create or replace function match_quran_verses(
  query_embedding vector(1024),
  match_count int default 5
)
returns table (
  surah int,
  ayah int,
  translation_text text,
  similarity float
)
language sql
stable
as $$
  select
    qe.surah,
    qe.ayah,
    qe.translation_text,
    1 - (qe.embedding <=> query_embedding) as similarity
  from quran_embeddings qe
  order by qe.embedding <=> query_embedding
  limit match_count;
$$;