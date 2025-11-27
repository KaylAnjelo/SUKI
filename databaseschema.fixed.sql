-- Reordered and syntax-corrected schema for restore testing
-- NOTE: This is a repair of the provided `databaseschema.sql` for local restore
-- It avoids trigger/function creation order issues and fixes a few syntax problems.

-- 1) users (parents)
create table public.users (
  user_id serial not null,
  username character varying(50) not null,
  password character varying(255) not null,
  first_name character varying(50) null,
  last_name character varying(50) null,
  contact_number character varying(20) null,
  user_email text null,
  role text null default 'customer'::text,
  store_id integer null,
  profile_image text null,
  constraint users_pkey primary key (user_id),
  constraint users_user_email_key unique (user_email),
  constraint users_username_key unique (username)
)
;

-- 2) stores (depends on users only via owner_id)
create table public.stores (
  store_id serial not null,
  owner_id integer not null,
  store_name character varying(100) not null,
  location character varying(100) null,
  is_active boolean null default true,
  store_code text null,
  store_image text null,
  owner_name text null,
  owner_contact character varying(20) null,
  inactive_since timestamp without time zone null,
  constraint stores_pkey primary key (store_id),
  constraint stores_store_code_key unique (store_code),
  constraint stores_store_name_key unique (store_name),
  constraint stores_owner_id_fkey foreign KEY (owner_id) references users (user_id) on delete CASCADE
)
;

create index IF not exists idx_stores_owner_id on public.stores using btree (owner_id);

-- 3) products (depends on stores)
create table public.products (
  id serial not null,
  product_name text not null,
  price numeric(10,2) not null,
  store_id integer not null,
  product_type text null,
  product_image text null,
  constraint products_pkey primary key (id),
  constraint products_product_name_key unique (product_name),
  constraint fk_products_store foreign KEY (store_id) references stores (store_id) on delete CASCADE
)
;
create index IF not exists idx_products_store_id on public.products using btree (store_id);

-- 4) rewards (depends on stores)
create table public.rewards (
  reward_id serial not null,
  store_id integer not null,
  reward_name character varying(100) not null,
  description text null,
  points_required integer not null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  start_date timestamp with time zone null,
  end_date timestamp with time zone null,
  promotion_code character varying(20) null,
  reward_type text null default 'generic'::text,
  discount_value numeric(10,2) null,
  free_item_product_id integer null,
  buy_x_quantity integer null,
  buy_x_product_id integer null,
  get_y_quantity integer null,
  get_y_product_id integer null,
  constraint rewards_pkey primary key (reward_id),
  constraint rewards_promotion_code_key unique (promotion_code),
  constraint rewards_store_id_fkey foreign KEY (store_id) references stores (store_id) on delete CASCADE
)
;
create index IF not exists idx_rewards_promotion_code on public.rewards using btree (promotion_code);
create index IF not exists idx_rewards_dates on public.rewards using btree (start_date, end_date);

-- 5) promotions (depends on stores)
create table public.promotions (
  promotion_id serial not null,
  store_id integer not null,
  name character varying(100) not null,
  description text null,
  discount_type character varying(20) not null,
  discount_value numeric(10,2) not null,
  min_purchase_amount numeric(10,2) null default 0,
  max_discount_amount numeric(10,2) null,
  start_date timestamp with time zone not null,
  end_date timestamp with time zone not null,
  usage_limit integer null,
  usage_count integer null default 0,
  status character varying(20) null default 'active'::character varying,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint promotions_pkey primary key (promotion_id),
  constraint promotions_dates_check check ((end_date > start_date)),
  constraint promotions_discount_value_check check ((discount_value > 0))
)
;
create index IF not exists idx_promotions_store_id on public.promotions using btree (store_id);
create index IF not exists idx_promotions_status on public.promotions using btree (status);
create index IF not exists idx_promotions_dates on public.promotions using btree (start_date, end_date);

-- 6) redemptions (depends on rewards)
create table public.redemptions (
  redemption_id serial not null,
  customer_id integer not null,
  store_id integer not null,
  reward_id integer not null,
  owner_id integer not null,
  points_used integer not null,
  status character varying(20) null default 'pending'::character varying,
  redemption_date timestamp with time zone null default now(),
  description text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint redemptions_pkey primary key (redemption_id),
  constraint fk_redemptions_reward foreign KEY (reward_id) references rewards (reward_id) on delete CASCADE
)
;
create index IF not exists idx_redemptions_customer_id on public.redemptions using btree (customer_id);
create index IF not exists idx_redemptions_store_id on public.redemptions using btree (store_id);
create index IF not exists idx_redemptions_owner_id on public.redemptions using btree (owner_id);

-- 7) store_dump
create table public.store_dump (
  dump_id serial not null,
  store_id integer not null,
  owner_id integer not null,
  store_name character varying(100) not null,
  location character varying(100) null,
  store_code text null,
  store_image text null,
  owner_name text null,
  owner_contact character varying(20) null,
  dumped_at timestamp with time zone null default now(),
  constraint store_dump_pkey primary key (dump_id)
)
;

-- 8) transactions (depends on products, stores, users)
create table public.transactions (
  id serial not null,
  transaction_date timestamp without time zone not null default now(),
  user_id integer null,
  store_id integer null,
  product_id integer not null,
  quantity integer not null,
  price numeric(10,2) not null,
  total numeric(10,2) GENERATED ALWAYS AS ((quantity::numeric * price)) STORED,
  points numeric(10,2) not null default 0,
  reference_number character varying(100) null,
  transaction_type text not null default 'Purchase'::text,
  constraint transactions_pkey primary key (id),
  constraint fk_transactions_product foreign KEY (product_id) references products (id) on delete RESTRICT,
  constraint fk_transactions_store foreign KEY (store_id) references stores (store_id) on delete set null,
  constraint fk_transactions_user foreign KEY (user_id) references users (user_id) on delete set null,
  constraint transactions_quantity_check check ((quantity > 0))
)
;
create index IF not exists idx_transactions_user_id on public.transactions using btree (user_id);
create index IF not exists idx_transactions_store_id on public.transactions using btree (store_id);
create index IF not exists idx_transactions_product_id on public.transactions using btree (product_id);
create index IF not exists idx_transactions_date on public.transactions using btree (transaction_date);
create index IF not exists idx_transactions_reference_number on public.transactions using btree (reference_number);

-- 9) user_logs
create table public.user_logs (
  log_id serial not null,
  user_id integer null,
  login_time timestamp with time zone null default now(),
  username text null,
  constraint user_logs_pkey primary key (log_id),
  constraint user_logs_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE,
  constraint user_logs_username_fkey foreign KEY (username) references users (username) on delete CASCADE
)
;

-- 10) user_points
create table public.user_points (
  id serial not null,
  user_id integer null,
  total_points integer null default 0,
  redeemed_points numeric(10,2) null,
  store_id integer null,
  constraint user_points_pkey primary key (id),
  constraint user_points_store_id_fkey foreign KEY (store_id) references stores (store_id),
  constraint user_points_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE
)
;

-- 11) notifications
create table public.notifications (
  id serial not null,
  user_id integer not null,
  title character varying(255) not null,
  message text not null,
  is_read boolean null default false,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint notifications_pkey primary key (id),
  constraint notifications_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE
)
;

-- Triggers and functions from the original schema are not included here.
-- If you need them for your application, add function definitions first, then recreate triggers.
