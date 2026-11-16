alter table public.education_articles
  add column if not exists audience text[] not null default array['buyer', 'seller'],
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists source_published_at timestamptz,
  add column if not exists synced_at timestamptz;

create unique index if not exists education_articles_source_url_uidx
  on public.education_articles (source_url);

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
