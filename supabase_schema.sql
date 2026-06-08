-- =====================================================================
-- OMNIPOS DATABASE SCHEMA
-- Compatible with Supabase PostgreSQL
-- Includes Multi-Tenancy (RLS), Grocery (UoM), and Pharmacy Modules
-- =====================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. TENANTS TABLE (Each business/shop registered)
create table public.tenants (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    country text not null,
    currency text not null default 'USD',
    subscription_price numeric(10, 2) not null default 0.00,
    subscription_status text not null default 'active' check (subscription_status in ('active', 'inactive')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on tenants
alter table public.tenants enable row level security;

-- 2. USER PROFILES TABLE (Linked to Supabase auth.users)
create table public.profiles (
    id uuid primary key references auth.users on delete cascade,
    tenant_id uuid references public.tenants(id) on delete cascade,
    full_name text,
    role text not null default 'tenant_admin' check (role in ('super_admin', 'tenant_admin', 'cashier')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- 3. PRODUCTS TABLE (Grocery & Medical Products)
create table public.products (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    name text not null,
    barcode text,
    type text not null default 'grocery' check (type in ('grocery', 'medical')),
    -- Medical specific fields
    generic_name text,       -- e.g., Paracetamol
    manufacturer text,       -- e.g., GlaxoSmithKline
    prescription_required boolean not null default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.products enable row level security;
create index idx_products_tenant_id on public.products(tenant_id);

-- 4. PRODUCT UNITS TABLE (UoM & Conversion ratios)
-- Base unit is the smallest saleable unit (e.g. Gram/Kg/Piece for Grocery, Tablet for Pharmacy)
create table public.product_units (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade not null,
    unit_name text not null,                    -- e.g., "Bag", "Kg", "Strip", "Tablet"
    is_base_unit boolean not null default false, -- If true, conversion_factor MUST be 1.00
    conversion_factor numeric(12, 4) not null default 1.0000 check (conversion_factor > 0), -- e.g., 1 Strip = 10 base tablets (factor=10.0)
    price numeric(10, 2) not null default 0.00,  -- Sales price for this unit
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.product_units enable row level security;
create index idx_product_units_product on public.product_units(product_id);

-- 5. INVENTORY BATCHES TABLE (FIFO tracking for Medical/Grocery cost & expiry)
create table public.inventory_batches (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete cascade not null,
    batch_number text,                         -- Required for Medical, optional for Grocery
    expiry_date date,                          -- Required for Medical (expiry alerts)
    purchase_cost numeric(10, 2) not null default 0.00,  -- Purchase cost per base unit
    quantity numeric(12, 4) not null default 0.0000,      -- Current quantity in base unit
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.inventory_batches enable row level security;
create index idx_inventory_batches_tenant_product on public.inventory_batches(tenant_id, product_id);

-- 6. SALES TRANSACTION LOG
create table public.sales (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    cashier_id uuid references public.profiles(id) on delete set null,
    total_amount numeric(10, 2) not null default 0.00,
    discount numeric(10, 2) not null default 0.00,
    tax_amount numeric(10, 2) not null default 0.00,
    payment_method text not null check (payment_method in ('cash', 'card', 'bank_transfer', 'mobile_wallet')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.sales enable row level security;
create index idx_sales_tenant on public.sales(tenant_id);

-- 7. SALE ITEMS TABLE
create table public.sale_items (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid references public.sales(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete cascade not null,
    batch_id uuid references public.inventory_batches(id) on delete set null,
    quantity numeric(12, 4) not null,             -- Quantity sold in base units
    unit_id uuid references public.product_units(id) on delete set null, -- The unit selected during billing (e.g. Strip)
    unit_price numeric(10, 2) not null,           -- The price per unit at sale time
    cost_price numeric(10, 2) not null,           -- The base unit cost at sale time (for profit analysis)
    total_price numeric(10, 2) not null           -- Total sale price for this item
);

alter table public.sale_items enable row level security;

-- =====================================================================
-- RLS POLICIES & HELPER FUNCTIONS
-- =====================================================================

-- Helper function to get currently logged in user's tenant_id
create or replace function public.get_auth_tenant_id()
returns uuid security definer as $$
begin
    return (select tenant_id from public.profiles where id = auth.uid());
end;
$$ language plpgsql;

-- Helper function to check if currently logged in user is Super Admin
create or replace function public.is_super_admin()
returns boolean security definer as $$
begin
    return exists (
        select 1 from public.profiles 
        where id = auth.uid() and role = 'super_admin'
    );
end;
$$ language plpgsql;

-- RLS: tenants policies
create policy "Super Admins have full access to tenants"
    on public.tenants for all using (public.is_super_admin());

create policy "Users can view their own tenant details"
    on public.tenants for select using (id = public.get_auth_tenant_id());

-- RLS: profiles policies
create policy "Super Admins have full access to profiles"
    on public.profiles for all using (public.is_super_admin());

create policy "Users can view profiles in their tenant"
    on public.profiles for select using (tenant_id = public.get_auth_tenant_id());

create policy "Users can update their own profile"
    on public.profiles for update using (id = auth.uid());

-- RLS: products policies
create policy "Tenants can manage their own products"
    on public.products for all using (
        tenant_id = public.get_auth_tenant_id() or public.is_super_admin()
    );

-- RLS: product_units policies
create policy "Tenants can manage their own product units"
    on public.product_units for all using (
        exists (
            select 1 from public.products 
            where products.id = product_units.product_id 
              and (products.tenant_id = public.get_auth_tenant_id() or public.is_super_admin())
        )
    );

-- RLS: inventory_batches policies
create policy "Tenants can manage their own batches"
    on public.inventory_batches for all using (
        tenant_id = public.get_auth_tenant_id() or public.is_super_admin()
    );

-- RLS: sales policies
create policy "Tenants can manage their own sales"
    on public.sales for all using (
        tenant_id = public.get_auth_tenant_id() or public.is_super_admin()
    );

-- RLS: sale_items policies
create policy "Tenants can manage their own sale items"
    on public.sale_items for all using (
        exists (
            select 1 from public.sales
            where sales.id = sale_items.sale_id
              and (sales.tenant_id = public.get_auth_tenant_id() or public.is_super_admin())
        )
    );

-- =====================================================================
-- AUTOMATIC PROFILE TRIGGER (Triggers when new auth.user is created)
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
    default_tenant_id uuid;
begin
    -- Check if tenant name is passed in metadata, otherwise create a new default tenant
    if new.raw_user_meta_data->>'tenant_name' is not null then
        insert into public.tenants (name, country, currency, subscription_price, subscription_status)
        values (
            coalesce(new.raw_user_meta_data->>'tenant_name', 'My Retail Store'),
            coalesce(new.raw_user_meta_data->>'country', 'Pakistan'),
            coalesce(new.raw_user_meta_data->>'currency', 'PKR'),
            0.00,
            'active'
        ) returning id into default_tenant_id;
    else
        -- Fallback: Use existing or create a dummy tenant
        insert into public.tenants (name, country, currency)
        values ('Demo Store', 'Pakistan', 'PKR')
        returning id into default_tenant_id;
    end if;

    -- Create profile link
    insert into public.profiles (id, tenant_id, full_name, role)
    values (
        new.id,
        default_tenant_id,
        coalesce(new.raw_user_meta_data->>'full_name', 'Shopkeeper'),
        coalesce(new.raw_user_meta_data->>'role', 'tenant_admin')
    );
    return new;
end;
$$ language plpgsql security definer;

-- Trigger execution
create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
