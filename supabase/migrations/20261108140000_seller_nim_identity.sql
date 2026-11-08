create table public.seller_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nim text not null check (length(btrim(nim)) > 0),
  created_at timestamptz not null default now()
);

create index seller_identities_nim_idx on public.seller_identities(nim);

alter table public.seller_identities enable row level security;
revoke all on public.seller_identities from anon, authenticated;
grant select on public.seller_identities to authenticated;

create policy "Sellers view their own NIM"
on public.seller_identities for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.capture_seller_nim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nim text;
begin
  if new.raw_user_meta_data->>'role' = 'seller' then
    v_nim := nullif(btrim(new.raw_user_meta_data->>'nim'), '');
    if v_nim is null then
      raise exception 'NIM wajib diisi untuk akun penjual.';
    end if;

    insert into public.seller_identities (user_id, nim)
    values (new.id, v_nim)
    on conflict (user_id) do update set nim = excluded.nim;
  end if;
  return new;
end;
$$;

revoke all on function public.capture_seller_nim() from public, anon, authenticated;

create trigger capture_seller_nim_on_signup
after insert on auth.users
for each row execute function public.capture_seller_nim();

insert into public.seller_identities (user_id, nim)
select id, btrim(raw_user_meta_data->>'nim')
from auth.users
where raw_user_meta_data->>'role' = 'seller'
  and nullif(btrim(raw_user_meta_data->>'nim'), '') is not null
on conflict (user_id) do update set nim = excluded.nim;
