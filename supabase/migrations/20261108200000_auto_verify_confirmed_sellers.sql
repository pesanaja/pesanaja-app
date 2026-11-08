create or replace function public.set_seller_verification_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_email_confirmed_at timestamptz;
  v_role text;
  v_has_nim boolean;
begin
  select u.email, u.email_confirmed_at, u.raw_user_meta_data->>'role',
    exists (select 1 from public.seller_identities si where si.user_id = u.id)
  into v_email, v_email_confirmed_at, v_role, v_has_nim
  from auth.users u
  where u.id = new.user_id;

  if v_role = 'seller'
    and lower(coalesce(v_email, '')) ~ '^[^@]+@student\.ub\.ac\.id$'
    and v_email_confirmed_at is not null
    and v_has_nim then
    new.verification_status := 'verified';
    new.verified_at := coalesce(new.verified_at, v_email_confirmed_at);
  else
    new.verification_status := 'pending';
    new.verified_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.set_seller_verification_from_profile() from public, anon, authenticated;

drop trigger if exists set_seller_verification_from_profile on public.seller_profiles;
create trigger set_seller_verification_from_profile
before insert or update on public.seller_profiles
for each row execute function public.set_seller_verification_from_profile();

create or replace function public.sync_seller_verification_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.seller_profiles sp
  set verification_status = case
        when new.raw_user_meta_data->>'role' = 'seller'
          and lower(coalesce(new.email, '')) ~ '^[^@]+@student\.ub\.ac\.id$'
          and new.email_confirmed_at is not null
          and exists (select 1 from public.seller_identities si where si.user_id = new.id)
          then 'verified'::public.seller_verification_status
        else 'pending'::public.seller_verification_status
      end,
      verified_at = case
        when new.raw_user_meta_data->>'role' = 'seller'
          and lower(coalesce(new.email, '')) ~ '^[^@]+@student\.ub\.ac\.id$'
          and new.email_confirmed_at is not null
          and exists (select 1 from public.seller_identities si where si.user_id = new.id)
          then coalesce(sp.verified_at, new.email_confirmed_at)
        else null
      end
  where sp.user_id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_seller_verification_from_auth() from public, anon, authenticated;

drop trigger if exists sync_seller_verification_from_auth on auth.users;
create trigger sync_seller_verification_from_auth
after update of email, email_confirmed_at, raw_user_meta_data on auth.users
for each row execute function public.sync_seller_verification_from_auth();

update public.seller_profiles sp
set verification_status = case
      when u.raw_user_meta_data->>'role' = 'seller'
        and lower(coalesce(u.email, '')) ~ '^[^@]+@student\.ub\.ac\.id$'
        and u.email_confirmed_at is not null
        and exists (select 1 from public.seller_identities si where si.user_id = u.id)
        then 'verified'::public.seller_verification_status
      else 'pending'::public.seller_verification_status
    end,
    verified_at = case
      when u.raw_user_meta_data->>'role' = 'seller'
        and lower(coalesce(u.email, '')) ~ '^[^@]+@student\.ub\.ac\.id$'
        and u.email_confirmed_at is not null
        and exists (select 1 from public.seller_identities si where si.user_id = u.id)
        then coalesce(sp.verified_at, u.email_confirmed_at)
      else null
    end
from auth.users u
where u.id = sp.user_id;
