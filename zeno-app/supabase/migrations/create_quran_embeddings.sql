-- Enable pgvector (already done)
create extension if not exists vector;

-- Create the embeddings table
create table if not exists quran_embeddings (
  id uuid primary key default gen_random_uuid(),
  surah int not null,
  ayah int not null,
  translation_text text not null,
  embedding vector(1024),
  unique(surah, ayah)
);

-- Index for cosine distance search
create index if not exists idx_quran_embeddings_vector on quran_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
