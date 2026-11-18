drop function if exists public.create_buyer_installment_order(uuid, jsonb, text);
drop function if exists public.create_buyer_order(uuid, jsonb, text);
drop trigger if exists sync_open_batch_product_price on public.products;

alter table public.products
  alter column price type bigint using price::bigint,
  alter column cost_price type bigint using cost_price::bigint;

alter table public.batch_products
  alter column price type bigint using price::bigint;

alter table public.orders
  alter column subtotal type bigint using subtotal::bigint,
  alter column total type bigint using total::bigint;

alter table public.order_items drop column line_total;
alter table public.order_items
  alter column unit_price type bigint using unit_price::bigint,
  alter column unit_cost type bigint using unit_cost::bigint;

alter table public.order_items
  add column line_total bigint generated always as (unit_price * quantity) stored;

alter table public.payments
  alter column amount type bigint using amount::bigint;

alter table public.operating_expenses
  alter column amount type bigint using amount::bigint;

create or replace function public.sync_open_batch_product_price()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.price is distinct from old.price then
    update public.batch_products bp
    set price = new.price
    from public.preorder_batches b
    where bp.product_id = new.id
      and bp.batch_id = b.id
      and b.store_id = new.store_id
      and b.status = 'open';
  end if;
  return new;
end;
$$;

create trigger sync_open_batch_product_price
after update of price on public.products
for each row execute function public.sync_open_batch_product_price();

create or replace function public.create_buyer_order(
  p_batch_id uuid,
  p_items jsonb,
  p_method text
)
returns table (order_id uuid, order_number text, payment_id uuid, total bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_store_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_payment_id uuid;
  v_subtotal bigint := 0;
  v_total bigint;
  v_item record;
  v_price bigint;
  v_stock_limit integer;
  v_product_stock integer;
  v_variants text[];
  v_variant text;
  v_reserved integer;
begin
  if v_buyer_id is null then
    raise exception 'Silakan masuk untuk membuat pesanan.';
  end if;
  if p_method is null or p_method not in ('qris', 'transfer', 'cash') then
    raise exception 'Metode pembayaran tidak valid.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Keranjang tidak valid.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    group by value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'Produk duplikat di dalam pesanan.';
  end if;

  select b.store_id into v_store_id
  from public.preorder_batches b
  join public.seller_profiles s on s.user_id = b.store_id
    and s.verification_status = 'verified'
  where b.id = p_batch_id and b.status = 'open'
    and (b.opens_at is null or b.opens_at <= now())
    and (b.closes_at is null or b.closes_at > now());
  if v_store_id is null then
    raise exception 'Batch pre-order sudah ditutup atau tidak tersedia.';
  end if;

  perform 1
  from public.batch_products bp
  where bp.batch_id = p_batch_id
    and bp.product_id in (
      select (value->>'product_id')::uuid from jsonb_array_elements(p_items) as item(value)
    )
  order by bp.product_id
  for update;

  perform 1
  from public.products p
  where p.id in (
    select (value->>'product_id')::uuid from jsonb_array_elements(p_items) as item(value)
  )
  order by p.id
  for update;

  for v_item in
    select (value->>'product_id')::uuid as product_id,
      (value->>'quantity')::integer as quantity,
      nullif(btrim(value->>'variant'), '') as variant
    from jsonb_array_elements(p_items) as item(value)
  loop
    if v_item.quantity is null or v_item.quantity < 1 then
      raise exception 'Jumlah produk tidak valid.';
    end if;

    select bp.price, bp.stock_limit, p.stock, p.variants
      into v_price, v_stock_limit, v_product_stock, v_variants
    from public.batch_products bp
    join public.products p on p.id = bp.product_id
    where bp.batch_id = p_batch_id
      and bp.product_id = v_item.product_id
      and p.store_id = v_store_id
      and p.is_active;
    if not found then
      raise exception 'Produk tidak tersedia pada batch ini.';
    end if;

    v_variant := v_item.variant;
    if cardinality(v_variants) > 0 then
      if v_variant is null or not (v_variant = any(v_variants)) then
        raise exception 'Varian produk tidak valid atau belum dipilih.';
      end if;
    elsif v_variant is not null then
      raise exception 'Produk ini tidak memiliki varian.';
    end if;

    if v_stock_limit is not null then
      select coalesce(sum(oi.quantity), 0)::integer into v_reserved
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = v_item.product_id
        and o.batch_id = p_batch_id
        and o.status <> 'cancelled';
      if v_stock_limit - v_reserved < v_item.quantity then
        raise exception 'Stok produk tidak mencukupi.';
      end if;
    end if;
    if v_product_stock is not null then
      select coalesce(sum(oi.quantity), 0)::integer into v_reserved
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = v_item.product_id and o.status <> 'cancelled';
      if v_product_stock - v_reserved < v_item.quantity then
        raise exception 'Stok produk tidak mencukupi.';
      end if;
    end if;
    v_subtotal := v_subtotal + v_price * v_item.quantity;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'Total pesanan harus lebih dari nol.';
  end if;
  v_total := v_subtotal;
  insert into public.orders (batch_id, store_id, buyer_id, status, subtotal, total)
  values (p_batch_id, v_store_id, v_buyer_id, 'unpaid', v_subtotal, v_total)
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (order_id, product_id, product_name, variant, unit_price, quantity)
  select v_order_id, p.id, p.name, nullif(btrim(value->>'variant'), ''), bp.price, (value->>'quantity')::integer
  from jsonb_array_elements(p_items) as item(value)
  join public.products p on p.id = (value->>'product_id')::uuid
  join public.batch_products bp on bp.product_id = p.id and bp.batch_id = p_batch_id;

  insert into public.payments (order_id, payer_id, amount, status, method)
  values (v_order_id, v_buyer_id, v_total, 'pending', p_method)
  returning id into v_payment_id;

  return query select v_order_id, v_order_number, v_payment_id, v_total;
end;
$$;

revoke all on function public.create_buyer_order(uuid, jsonb, text) from public, anon;
grant execute on function public.create_buyer_order(uuid, jsonb, text) to authenticated;

create or replace function public.create_buyer_installment_order(
  p_batch_id uuid,
  p_items jsonb,
  p_method text
)
returns table (order_id uuid, order_number text, payment_id uuid, total bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_initial_payment_id uuid;
  v_payment_id uuid;
  v_total bigint;
  v_down_payment bigint;
  v_remaining bigint;
  v_second_payment bigint;
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
