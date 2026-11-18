do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise exception 'Tambahkan secret project_url dan service_role_key ke Supabase Vault sebelum menjadwalkan sinkronisasi.';
  end if;
end
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh-education-weekly';

select cron.schedule(
  'refresh-education-weekly',
  '0 2 * * 1',
  $job$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'project_url'), '/')
        || '/functions/v1/refresh-education',
      timeout_milliseconds := 120000,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
  $job$
);
