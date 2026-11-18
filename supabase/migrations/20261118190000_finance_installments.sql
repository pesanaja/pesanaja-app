alter table public.order_items
  add column if not exists unit_cost integer;

update public.order_items oi
set unit_cost = p.cost_price
from public.products p
where p.id = oi.product_id and oi.unit_cost is null;

alter table public.order_items
  alter column unit_cost set default 0,
  alter column unit_cost set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_unit_cost_nonnegative'
  ) then
    alter table public.order_items
      add constraint order_items_unit_cost_nonnegative check (unit_cost >= 0);
  end if;
end
$$;

create or replace function public.capture_order_item_unit_cost()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select cost_price into new.unit_cost
  from public.products
  where id = new.product_id;

  if not found then
    raise exception 'Produk untuk item pesanan tidak ditemukan.';
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_capture_unit_cost on public.order_items;
create trigger order_items_capture_unit_cost
before insert on public.order_items
for each row execute function public.capture_order_item_unit_cost();

alter table public.payments
  add column if not exists installment_number smallint,
  add column if not exists due_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_installment_number_valid'
  ) then
    alter table public.payments
      add constraint payments_installment_number_valid
      check (installment_number is null or installment_number between 1 and 3);
  end if;
end
$$;

create unique index if not exists payments_order_installment_uidx
  on public.payments (order_id, installment_number)
  where installment_number is not null;

create table if not exists public.operating_expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  description text not null check (length(btrim(description)) > 0),
  amount integer not null check (amount > 0),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.operating_expenses enable row level security;
revoke all on table public.operating_expenses from anon;
grant select, insert, update, delete on table public.operating_expenses to authenticated;

drop policy if exists "Sellers view their operating expenses" on public.operating_expenses;
create policy "Sellers view their operating expenses"
on public.operating_expenses for select to authenticated
using (store_id = (select auth.uid()));

drop policy if exists "Sellers add their operating expenses" on public.operating_expenses;
create policy "Sellers add their operating expenses"
on public.operating_expenses for insert to authenticated
with check (store_id = (select auth.uid()));

drop policy if exists "Sellers update their operating expenses" on public.operating_expenses;
create policy "Sellers update their operating expenses"
on public.operating_expenses for update to authenticated
using (store_id = (select auth.uid()))
with check (store_id = (select auth.uid()));

drop policy if exists "Sellers delete their operating expenses" on public.operating_expenses;
create policy "Sellers delete their operating expenses"
on public.operating_expenses for delete to authenticated
using (store_id = (select auth.uid()));

drop function if exists public.create_buyer_installment_order(uuid, jsonb, text);
create or replace function public.create_buyer_installment_order(
  p_batch_id uuid,
  p_items jsonb,
  p_method text
)
returns table (order_id uuid, order_number text, payment_id uuid, total integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_initial_payment_id uuid;
  v_payment_id uuid;
  v_total integer;
  v_down_payment integer;
  v_remaining integer;
  v_second_payment integer;
  v_now timestamptz := now();
begin
  select created.order_id, created.order_number, created.payment_id, created.total
  into v_order_id, v_order_number, v_initial_payment_id, v_total
  from public.create_buyer_order(p_batch_id, p_items, p_method) as created;

  if v_total < 4 then
    raise exception 'Total pesanan terlalu kecil untuk dibagi menjadi tiga cicilan.';
  end if;

  v_down_payment := (v_total + 1) / 2;
  v_remaining := v_total - v_down_payment;
  v_second_payment := (v_remaining + 1) / 2;

  update public.orders
  set status = 'installment', updated_at = v_now
  where id = v_order_id;

  delete from public.payments
  where id = v_initial_payment_id and status = 'pending';

  insert into public.payments (order_id, payer_id, amount, status, method, installment_number, due_at)
  values (v_order_id, auth.uid(), v_down_payment, 'pending', p_method, 1, v_now)
  returning id into v_payment_id;

  insert into public.payments (order_id, payer_id, amount, status, method, installment_number, due_at)
  values (v_order_id, auth.uid(), v_second_payment, 'pending', p_method, 2, v_now + interval '7 days');

  insert into public.payments (order_id, payer_id, amount, status, method, installment_number, due_at)
  values (v_order_id, auth.uid(), v_remaining - v_second_payment, 'pending', p_method, 3, v_now + interval '14 days');

  return query select v_order_id, v_order_number, v_payment_id, v_total;
end;
$$;

revoke all on function public.create_buyer_installment_order(uuid, jsonb, text) from public, anon;
grant execute on function public.create_buyer_installment_order(uuid, jsonb, text) to authenticated;

create or replace function public.attach_payment_proof(
  p_payment_id uuid,
  p_proof_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or p_proof_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]+/.+') then
    raise exception 'Bukti pembayaran tidak valid.';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'payment-proofs' and name = p_proof_path
  ) then
    raise exception 'File bukti pembayaran belum tersedia.';
  end if;

  update public.payments p
  set proof_url = p_proof_path
  from public.orders o
  where p.id = p_payment_id
    and p.order_id = o.id
    and p.payer_id = auth.uid()
    and o.buyer_id = auth.uid()
    and o.status <> 'cancelled'
    and p.status = 'pending';

  if not found then
    raise exception 'Pesanan atau pembayaran tidak ditemukan.';
  end if;
end;
$$;

revoke all on function public.attach_payment_proof(uuid, text) from public, anon;
grant execute on function public.attach_payment_proof(uuid, text) to authenticated;

create or replace function public.confirm_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_installment_number smallint;
begin
  select p.order_id, p.installment_number
  into v_order_id, v_installment_number
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = p_payment_id
    and o.store_id = auth.uid()
    and o.status <> 'cancelled'
    and p.status = 'pending'
  for update of o, p;

  if not found then
    raise exception 'Pembayaran tidak ditemukan atau sudah diproses.';
  end if;

  if v_installment_number > 1 and exists (
    select 1 from public.payments p
    where p.order_id = v_order_id
      and p.installment_number < v_installment_number
      and p.status <> 'paid'
  ) then
    raise exception 'Cicilan sebelumnya belum dibayar.';
  end if;

  if exists (
    select 1 from public.payments p
    where p.id = p_payment_id
      and p.method <> 'cash'
      and p.proof_url is null
  ) then
    raise exception 'Bukti pembayaran belum diunggah.';
  end if;

  update public.payments p
  set status = 'paid', paid_at = now()
  where p.id = p_payment_id
    and p.status = 'pending'
    and (p.method = 'cash' or p.proof_url is not null);

  if not found then
    raise exception 'Pembayaran tidak ditemukan atau sudah diproses.';
  end if;

  update public.orders o
  set status = case
        when exists (
          select 1 from public.payments p
          where p.order_id = v_order_id and p.status <> 'paid'
        ) then 'installment'::public.order_status
        else 'paid'::public.order_status
      end,
      updated_at = now()
  where o.id = v_order_id and o.store_id = auth.uid() and o.status <> 'cancelled';
end;
$$;

revoke all on function public.confirm_payment(uuid) from public, anon;
grant execute on function public.confirm_payment(uuid) to authenticated;

create or replace function public.cancel_buyer_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  select o.id into v_order_id
  from public.orders o
  where o.id = p_order_id
    and o.buyer_id = auth.uid()
    and o.status in ('ordered', 'unpaid', 'installment')
  for update;

  if not found or exists (
    select 1 from public.payments p
    where p.order_id = v_order_id and p.status = 'paid'
  ) then
    raise exception 'Pesanan tidak dapat dibatalkan setelah pembayaran diterima.';
  end if;

  update public.orders o
  set status = 'cancelled', updated_at = now()
  where o.id = p_order_id
    and o.buyer_id = auth.uid();

  if not found then
    raise exception 'Pesanan gagal dibatalkan.';
  end if;
end;
$$;

revoke all on function public.cancel_buyer_order(uuid) from public, anon;
grant execute on function public.cancel_buyer_order(uuid) to authenticated;
