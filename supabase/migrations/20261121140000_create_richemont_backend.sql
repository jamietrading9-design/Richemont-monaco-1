create table if not exists public.products (
  slug text primary key,
  number text,
  title text not null,
  name text,
  description text,
  price numeric not null default 0,
  discount_price numeric,
  currency text not null default 'EUR',
  image text,
  alt text,
  material text,
  sizes jsonb not null default '[]'::jsonb,
  category text,
  detail_page text,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id text primary key,
  site_title text not null default 'Richemont Monaco',
  site_subtitle text not null default 'Designer Clothing',
  maintenance jsonb not null default '{}'::jsonb,
  site_content jsonb not null default '{}'::jsonb,
  invoice_details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  customer jsonb not null default '{}'::jsonb,
  notes text,
  payment_method text not null default 'banktransfer',
  iban text,
  status text not null default 'offen',
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.categories (
  name text primary key,
  description text
);

create table if not exists public.expenses (
  id text primary key,
  supplier text,
  description text,
  amount numeric not null,
  tax_rate numeric not null default 0,
  date date,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.discounts (
  id text primary key,
  name text,
  type text,
  value numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.site_settings enable row level security;
alter table public.orders enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.discounts enable row level security;

create policy "public read products" on public.products for select using (true);
create policy "public read settings" on public.site_settings for select using (true);
create policy "public read categories" on public.categories for select using (true);
create policy "public read discounts" on public.discounts for select using (true);
create policy "public create orders" on public.orders for insert
  with check (true);

create or replace function public.get_order_status(p_order_id text)
returns table (
  id text,
  total numeric,
  status text,
  tracking_number text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select o.id, o.total, o.status, o.tracking_number, o.created_at
  from public.orders o
  where o.id = p_order_id or o.tracking_number = p_order_id
  limit 1;
$$;

revoke all on function public.get_order_status(text) from public;
grant execute on function public.get_order_status(text) to anon, authenticated;

insert into public.site_settings (id, site_title, site_subtitle)
values ('main', 'Richemont Monaco', 'Designer Clothing')
on conflict (id) do nothing;
