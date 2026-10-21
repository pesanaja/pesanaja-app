-- PesanAja initial schema. Apply only after the target Supabase project is authorized.
create extension if not exists pgcrypto;

create type public.store_role as enum ('buyer', 'seller');
create type public.seller_verification_status as enum ('pending', 'verified', 'rejected');
create type public.batch_status as enum ('draft', 'open', 'closed', 'completed', 'cancelled');
create type public.order_status as enum ('ordered', 'unpaid', 'paid', 'cancelled', 'completed', 'installment');
create type public.payment_status as enum ('pending', 'paid', 'rejected', 'refunded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  campus text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seller_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  store_name text not null,
  slug text not null unique,
  description text,
  product_categories text[] not null default '{}',
  pickup_location text,
  payment_details text,
  logo_url text,
  verification_status public.seller_verification_status not null default 'pending',
  verification_submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.store_memberships (
  store_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.store_role not null default 'seller',
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  name text not null,
  description text,
  category text,
  image_url text,
  price integer not null check (price >= 0),
  cost_price integer not null default 0 check (cost_price >= 0),
  stock integer check (stock is null or stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.preorder_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  name text not null,
  description text,
  status public.batch_status not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  target_orders integer check (target_orders is null or target_orders > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create table public.batch_products (
  batch_id uuid not null references public.preorder_batches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price integer not null check (price >= 0),
  stock_limit integer check (stock_limit is null or stock_limit >= 0),
  primary key (batch_id, product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('PJA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  batch_id uuid not null references public.preorder_batches(id),
  store_id uuid not null references public.seller_profiles(user_id),
  buyer_id uuid not null references public.profiles(id),
  status public.order_status not null default 'ordered',
  subtotal integer not null default 0 check (subtotal >= 0),
  total integer not null default 0 check (total >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total integer generated always as (unit_price * quantity) stored
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payer_id uuid not null references public.profiles(id),
  amount integer not null check (amount > 0),
  status public.payment_status not null default 'pending',
  method text,
  proof_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.education_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  body text not null default '',
  category text,
  cover_url text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index products_store_active_idx on public.products(store_id, is_active);
create index batches_store_status_idx on public.preorder_batches(store_id, status);
create index orders_store_created_idx on public.orders(store_id, created_at desc);
create index orders_buyer_created_idx on public.orders(buyer_id, created_at desc);
create index order_items_product_idx on public.order_items(product_id);
create index payments_order_idx on public.payments(order_id, created_at desc);

-- Every exposed table is protected by row-level security.
alter table public.profiles enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.store_memberships enable row level security;
alter table public.products enable row level security;
alter table public.preorder_batches enable row level security;
alter table public.batch_products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.education_articles enable row level security;

create policy "Profiles are visible to signed-in users" on public.profiles for select to authenticated using (true);
create policy "Users create their own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Verified seller profiles are public" on public.seller_profiles for select to anon, authenticated using (verification_status = 'verified' or (select auth.uid()) = user_id);
create policy "Users create their seller profile" on public.seller_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update their seller profile" on public.seller_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Members can view memberships" on public.store_memberships for select to authenticated using (user_id = (select auth.uid()) or store_id = (select auth.uid()));
create policy "Store owners add membership" on public.store_memberships for insert to authenticated with check (store_id = (select auth.uid()));

create policy "Active products are public" on public.products for select to anon, authenticated using (is_active or store_id = (select auth.uid()));
create policy "Store owners manage products" on public.products for all to authenticated using (store_id = (select auth.uid())) with check (store_id = (select auth.uid()));
create policy "Open batches are public" on public.preorder_batches for select to anon, authenticated using (status = 'open' or store_id = (select auth.uid()));
create policy "Store owners manage batches" on public.preorder_batches for all to authenticated using (store_id = (select auth.uid())) with check (store_id = (select auth.uid()));
create policy "Batch products visible with open batch" on public.batch_products for select to anon, authenticated using (exists (select 1 from public.preorder_batches b where b.id = batch_id and (b.status = 'open' or b.store_id = (select auth.uid()))));
create policy "Store owners manage batch products" on public.batch_products for all to authenticated using (exists (select 1 from public.preorder_batches b where b.id = batch_id and b.store_id = (select auth.uid()))) with check (exists (select 1 from public.preorder_batches b where b.id = batch_id and b.store_id = (select auth.uid())));

create policy "Buyers and store owners view orders" on public.orders for select to authenticated using (buyer_id = (select auth.uid()) or store_id = (select auth.uid()));
create policy "Buyers create orders for open batches" on public.orders for insert to authenticated with check (
  buyer_id = (select auth.uid()) and exists (
    select 1 from public.preorder_batches b
    where b.id = orders.batch_id and b.store_id = orders.store_id and b.status = 'open'
  )
);
create policy "Store owners update orders" on public.orders for update to authenticated using (store_id = (select auth.uid())) with check (store_id = (select auth.uid()));
create policy "Order parties view line items" on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = (select auth.uid()) or o.store_id = (select auth.uid()))));
create policy "Buyers add order line items" on public.order_items for insert to authenticated with check (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));

create policy "Order parties view payments" on public.payments for select to authenticated using (payer_id = (select auth.uid()) or exists (select 1 from public.orders o where o.id = order_id and o.store_id = (select auth.uid())));
create policy "Buyers create own pending payments" on public.payments for insert to authenticated with check (
  payer_id = (select auth.uid()) and status = 'pending' and exists (
    select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())
  )
);
-- Payment state changes are intentionally withheld from direct client updates.
-- Add a narrowly scoped RPC or backend workflow when payment reconciliation is implemented.

create policy "Published education is public" on public.education_articles for select to anon, authenticated using (published_at is not null and published_at <= now());
