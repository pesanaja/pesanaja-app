create or replace function public.require_student_email_for_sellers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.raw_user_meta_data->>'role' = 'seller'
    and lower(new.email) !~ '^[^@]+@student\.ub\.ac\.id$' then
    raise exception 'Pendaftaran penjual hanya menggunakan email @student.ub.ac.id.';
  end if;
  return new;
end;
$$;

revoke all on function public.require_student_email_for_sellers() from public, anon, authenticated;

create trigger require_student_email_for_sellers
before insert on auth.users
for each row execute function public.require_student_email_for_sellers();
