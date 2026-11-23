alter table public.operating_expenses
  add column if not exists batch_id uuid references public.preorder_batches(id);

create index if not exists operating_expenses_store_batch_date_idx
  on public.operating_expenses (store_id, batch_id, occurred_on desc);

drop policy if exists "Sellers add their operating expenses" on public.operating_expenses;
create policy "Sellers add their operating expenses"
on public.operating_expenses for insert to authenticated
with check (
  store_id = (select auth.uid())
  and (
    batch_id is null
    or exists (
      select 1
      from public.preorder_batches b
      where b.id = operating_expenses.batch_id
        and b.store_id = (select auth.uid())
    )
  )
);

drop policy if exists "Sellers update their operating expenses" on public.operating_expenses;
create policy "Sellers update their operating expenses"
on public.operating_expenses for update to authenticated
using (store_id = (select auth.uid()))
with check (
  store_id = (select auth.uid())
  and (
    batch_id is null
    or exists (
      select 1
      from public.preorder_batches b
      where b.id = operating_expenses.batch_id
        and b.store_id = (select auth.uid())
    )
  )
);
