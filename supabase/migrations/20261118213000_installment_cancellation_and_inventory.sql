alter table public.orders
  add column if not exists cancelled_by text,
  add column if not exists cancellation_reason text,
  add column if not exists inventory_reserved_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_cancelled_by_valid'
  ) then
    alter table public.orders
      add constraint orders_cancelled_by_valid
      check (cancelled_by is null or cancelled_by in ('buyer', 'seller'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_cancellation_reason_length'
  ) then
    alter table public.orders
      add constraint orders_cancellation_reason_length
      check (cancellation_reason is null or char_length(cancellation_reason) <= 500);
  end if;
end
$$;

do $$
begin
  update public.products p
  set stock = greatest(
    p.stock - coalesce((
      select sum(oi.quantity)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = p.id
        and o.status <> 'cancelled'
        and o.inventory_reserved_at is null
    ), 0),
    0
  )::integer
  where p.stock is not null;

  update public.batch_products bp
  set stock_limit = greatest(
    bp.stock_limit - coalesce((
      select sum(oi.quantity)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = bp.product_id
        and o.batch_id = bp.batch_id
        and o.status <> 'cancelled'
        and o.inventory_reserved_at is null
    ), 0),
    0
  )::integer
  where bp.stock_limit is not null;

  update public.orders
  set inventory_reserved_at = created_at
  where status <> 'cancelled'
    and inventory_reserved_at is null;
end
$$;

update public.payments p
set status = 'rejected'
from public.orders o
where p.order_id = o.id
  and o.status = 'cancelled'
  and p.status = 'pending';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
  v_item record;
  v_price bigint;
  v_stock_limit integer;
  v_product_stock integer;
  v_variants text[];
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
    group by (value->>'product_id')::uuid, coalesce(nullif(btrim(value->>'variant'), ''), '')
    having count(*) > 1
  ) then
    raise exception 'Produk dan varian duplikat di dalam pesanan.';
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
  if p_method = 'qris' and not exists (
    select 1 from public.seller_profiles
    where user_id = v_store_id and nullif(btrim(qris_image_path), '') is not null
  ) then
    raise exception 'Penjual belum memiliki QRIS.';
  end if;
  if p_method = 'transfer' and not exists (
    select 1 from public.seller_profiles
    where user_id = v_store_id and nullif(btrim(payment_details), '') is not null
  ) then
    raise exception 'Penjual belum mengisi informasi rekening.';
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
      sum((value->>'quantity')::integer)::bigint as quantity
    from jsonb_array_elements(p_items) as item(value)
    group by (value->>'product_id')::uuid
    order by (value->>'product_id')::uuid
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

    if coalesce(cardinality(v_variants), 0) > 0 then
      if exists (
        select 1 from jsonb_array_elements(p_items) as item(value)
        where (value->>'product_id')::uuid = v_item.product_id
          and (
            nullif(btrim(value->>'variant'), '') is null
            or not (nullif(btrim(value->>'variant'), '') = any(v_variants))
          )
      ) then
        raise exception 'Varian produk tidak valid atau belum dipilih.';
      end if;
    elsif exists (
      select 1 from jsonb_array_elements(p_items) as item(value)
      where (value->>'product_id')::uuid = v_item.product_id
        and nullif(btrim(value->>'variant'), '') is not null
    ) then
      raise exception 'Produk ini tidak memiliki varian.';
    end if;

    if v_stock_limit is not null and v_stock_limit < v_item.quantity then
      raise exception 'Stok produk tidak mencukupi.';
    end if;
    if v_product_stock is not null and v_product_stock < v_item.quantity then
      raise exception 'Stok produk tidak mencukupi.';
    end if;

    update public.batch_products
    set stock_limit = stock_limit - v_item.quantity::integer
    where batch_id = p_batch_id and product_id = v_item.product_id and stock_limit is not null;

    update public.products
    set stock = stock - v_item.quantity::integer,
        updated_at = now()
    where id = v_item.product_id and stock is not null;

    v_subtotal := v_subtotal + v_price * v_item.quantity;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'Total pesanan harus lebih dari nol.';
  end if;

  insert into public.orders (batch_id, store_id, buyer_id, status, subtotal, total, inventory_reserved_at)
  values (p_batch_id, v_store_id, v_buyer_id, 'unpaid', v_subtotal, v_subtotal, now())
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (order_id, product_id, product_name, variant, unit_price, quantity)
  select v_order_id, p.id, p.name, nullif(btrim(value->>'variant'), ''), bp.price, (value->>'quantity')::integer
  from jsonb_array_elements(p_items) as item(value)
  join public.products p on p.id = (value->>'product_id')::uuid
  join public.batch_products bp on bp.product_id = p.id and bp.batch_id = p_batch_id;

  insert into public.payments (order_id, payer_id, amount, status, method)
  values (v_order_id, v_buyer_id, v_subtotal, 'pending', p_method)
  returning id into v_payment_id;

  return query select v_order_id, v_order_number, v_payment_id, v_subtotal;
end;
$$;

revoke all on function public.create_buyer_order(uuid, jsonb, text) from public, anon;
grant execute on function public.create_buyer_order(uuid, jsonb, text) to authenticated;

create or replace function public.cancel_order_and_restore_inventory(
  p_order_id uuid,
  p_cancelled_by text,
  p_cancellation_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_item record;
  v_reason text := nullif(btrim(p_cancellation_reason), '');
begin
  if auth.uid() is null or p_cancelled_by not in ('buyer', 'seller') then
    raise exception 'Permintaan pembatalan tidak valid.';
  end if;

  select id, batch_id, buyer_id, store_id, status, inventory_reserved_at
    into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.';
  end if;
  if (p_cancelled_by = 'buyer' and v_order.buyer_id <> auth.uid())
    or (p_cancelled_by = 'seller' and v_order.store_id <> auth.uid()) then
    raise exception 'Kamu tidak memiliki akses untuk membatalkan pesanan ini.';
  end if;
  if v_order.status not in ('ordered', 'unpaid', 'installment') then
    raise exception 'Pesanan tidak dapat dibatalkan pada status ini.';
  end if;
  if p_cancelled_by = 'seller' and v_reason is null then
    raise exception 'Alasan pembatalan wajib diisi.';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Alasan pembatalan maksimal 500 karakter.';
  end if;
  if exists (
    select 1 from public.payments
    where order_id = p_order_id and status = 'paid'
  ) then
    raise exception 'Pesanan tidak dapat dibatalkan setelah pembayaran diterima.';
  end if;

  if v_order.inventory_reserved_at is not null then
    perform 1
    from public.batch_products bp
    join public.order_items oi on oi.product_id = bp.product_id and bp.batch_id = v_order.batch_id
    where oi.order_id = p_order_id
    order by bp.product_id
    for update of bp;

    perform 1
    from public.products p
    join public.order_items oi on oi.product_id = p.id
    where oi.order_id = p_order_id
    order by p.id
    for update of p;

    for v_item in
      select product_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id
      group by product_id
      order by product_id
    loop
      update public.products
      set stock = stock + v_item.quantity,
          updated_at = now()
      where id = v_item.product_id and stock is not null;

      update public.batch_products
      set stock_limit = stock_limit + v_item.quantity
      where batch_id = v_order.batch_id
        and product_id = v_item.product_id
        and stock_limit is not null;
    end loop;
  end if;

  update public.payments
  set status = 'rejected'
  where order_id = p_order_id and status = 'pending';

  update public.orders
  set status = 'cancelled',
      cancelled_by = p_cancelled_by,
      cancellation_reason = case when p_cancelled_by = 'seller' then v_reason else null end,
      updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.cancel_order_and_restore_inventory(uuid, text, text) from public, anon, authenticated;

create or replace function public.cancel_buyer_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.cancel_order_and_restore_inventory(p_order_id, 'buyer', null);
end;
$$;

revoke all on function public.cancel_buyer_order(uuid) from public, anon;
grant execute on function public.cancel_buyer_order(uuid) to authenticated;

create or replace function public.cancel_seller_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.cancel_order_and_restore_inventory(p_order_id, 'seller', p_reason);
end;
$$;

revoke all on function public.cancel_seller_order(uuid, text) from public, anon;
grant execute on function public.cancel_seller_order(uuid, text) to authenticated;
