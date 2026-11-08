create or replace function public.update_seller_batch(
  p_batch_id uuid,
  p_name text,
  p_closes_at timestamptz,
  p_product_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_store_id uuid := auth.uid();
  v_status public.batch_status;
  v_product_count integer;
begin
  if v_store_id is null or not exists (
    select 1 from public.seller_profiles where user_id = v_store_id
  ) then
    raise exception 'Profil penjual tidak ditemukan.';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Nama batch wajib diisi.';
  end if;
  if p_closes_at is null or p_closes_at <= now() then
    raise exception 'Waktu tutup harus di masa mendatang.';
  end if;
  if p_product_ids is null or cardinality(p_product_ids) = 0 then
    raise exception 'Pilih minimal satu produk untuk batch.';
  end if;

  select status into v_status
  from public.preorder_batches
  where id = p_batch_id and store_id = v_store_id
  for update;
  if not found or v_status not in ('open', 'draft') then
    raise exception 'Batch tidak ditemukan atau tidak dapat diedit.';
  end if;

  select count(distinct product_id)::integer into v_product_count
  from unnest(p_product_ids) as products(product_id);
  if v_product_count <> cardinality(p_product_ids) then
    raise exception 'Produk duplikat pada batch.';
  end if;

  perform 1 from public.products p
  where p.store_id = v_store_id
    and p.is_active
    and p.id = any(p_product_ids)
  order by p.id
  for update;
  if (select count(*) from public.products p
      where p.store_id = v_store_id and p.is_active and p.id = any(p_product_ids)) <> v_product_count then
    raise exception 'Sebagian produk tidak aktif atau bukan milik tokomu.';
  end if;

  update public.preorder_batches
  set name = btrim(p_name), closes_at = p_closes_at, updated_at = now()
  where id = p_batch_id and store_id = v_store_id;

  delete from public.batch_products
  where batch_id = p_batch_id and product_id <> all(p_product_ids);

  insert into public.batch_products (batch_id, product_id, price, stock_limit)
  select p_batch_id, p.id, p.price, p.stock
  from public.products p
  where p.store_id = v_store_id and p.is_active and p.id = any(p_product_ids)
  on conflict (batch_id, product_id) do nothing;
end;
$$;

revoke all on function public.update_seller_batch(uuid, text, timestamptz, uuid[]) from public, anon;
grant execute on function public.update_seller_batch(uuid, text, timestamptz, uuid[]) to authenticated;
