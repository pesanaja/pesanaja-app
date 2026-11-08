alter table public.products
  add column if not exists variants text[] not null default '{}';

alter table public.order_items
  add column if not exists variant text;

create or replace function public.create_buyer_order(
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
  v_buyer_id uuid := auth.uid();
  v_store_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_payment_id uuid;
  v_subtotal integer := 0;
  v_total integer;
  v_item record;
  v_price integer;
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
