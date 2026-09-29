-- JOY EXTREME WF Sales shared inventory schema
-- Run this file once in Supabase Dashboard > SQL Editor before seed.sql.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  ean text,
  sku text,
  product_name text not null,
  initial_stock integer not null check (initial_stock >= 0),
  current_stock integer not null check (current_stock >= 0 and current_stock <= initial_stock),
  sale_price numeric(12, 2) check (sale_price is null or sale_price >= 0),
  original_price numeric(12, 2) check (original_price is null or original_price >= 0),
  currency text not null default 'CNY' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ean is null or length(trim(ean)) > 0),
  check (sku is null or length(trim(sku)) > 0)
);

create unique index if not exists products_ean_unique
  on public.products (ean) where ean is not null;
create unique index if not exists products_sku_unique
  on public.products (sku) where sku is not null;
create index if not exists products_name_idx on public.products (product_name);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id),
  ean text,
  sku text,
  product_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) check (unit_price is null or unit_price >= 0),
  line_total numeric(12, 2) generated always as (unit_price * quantity) stored,
  currency text not null default 'CNY' check (currency ~ '^[A-Z]{3}$'),
  operator text not null check (length(trim(operator)) between 1 and 80),
  sold_at timestamptz not null default now(),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by text,
  check (
    (status = 'confirmed' and cancelled_at is null and cancelled_by is null)
    or
    (status = 'cancelled' and cancelled_at is not null and length(trim(cancelled_by)) between 1 and 80)
  )
);

create index if not exists sales_sold_at_idx on public.sales (sold_at desc);
create index if not exists sales_product_id_idx on public.sales (product_id);
create index if not exists sales_status_idx on public.sales (status);

alter table public.products enable row level security;
alter table public.sales enable row level security;

revoke all on table public.products from anon, authenticated;
revoke all on table public.sales from anon, authenticated;
grant select on table public.products to anon, authenticated;
grant select on table public.sales to anon, authenticated;

drop policy if exists "shared inventory products are readable" on public.products;
create policy "shared inventory products are readable"
  on public.products for select
  to anon, authenticated
  using (true);

drop policy if exists "shared inventory sales are readable" on public.sales;
create policy "shared inventory sales are readable"
  on public.sales for select
  to anon, authenticated
  using (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public;

create or replace function public.sell_product(
  p_product_id text,
  p_operator text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_sale_id uuid;
  v_operator text := trim(p_operator);
begin
  if v_operator is null or length(v_operator) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_OPERATOR';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  if v_product.current_stock <= 0 then
    raise exception using errcode = 'P0001', message = 'OUT_OF_STOCK';
  end if;

  update public.products
  set current_stock = current_stock - 1,
      updated_at = now()
  where id = v_product.id;

  insert into public.sales (
    product_id, ean, sku, product_name, quantity,
    unit_price, currency, operator
  ) values (
    v_product.id, v_product.ean, v_product.sku, v_product.product_name, 1,
    v_product.sale_price, v_product.currency, v_operator
  )
  returning id into v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'product_id', v_product.id,
    'current_stock', v_product.current_stock - 1,
    'unit_price', v_product.sale_price,
    'currency', v_product.currency
  );
end;
$$;

create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_operator text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_operator text := trim(p_operator);
  v_stock integer;
begin
  if v_operator is null or length(v_operator) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_OPERATOR';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'SALE_NOT_FOUND';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'ALREADY_CANCELLED';
  end if;

  update public.products
  set current_stock = current_stock + v_sale.quantity,
      updated_at = now()
  where id = v_sale.product_id
    and current_stock + v_sale.quantity <= initial_stock
  returning current_stock into v_stock;

  if not found then
    raise exception using errcode = '23514', message = 'STOCK_RESTORE_CONFLICT';
  end if;

  update public.sales
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_operator
  where id = v_sale.id;

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'product_id', v_sale.product_id,
    'status', 'cancelled',
    'current_stock', v_stock
  );
end;
$$;

revoke all on function public.sell_product(text, text) from public;
revoke all on function public.cancel_sale(uuid, text) from public;
grant execute on function public.sell_product(text, text) to anon, authenticated;
grant execute on function public.cancel_sale(uuid, text) to anon, authenticated;

comment on function public.sell_product(text, text) is
  'Atomically locks a product, decrements stock, and records a priced sale.';
comment on function public.cancel_sale(uuid, text) is
  'Atomically marks a sale cancelled and restores its product stock.';
