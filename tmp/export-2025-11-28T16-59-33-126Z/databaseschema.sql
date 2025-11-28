create table public.claimed_rewards (
  id serial not null,
  user_id integer not null,
  reward_id integer not null,
  claimed_at timestamp with time zone null default now(),
  is_redeemed boolean null default false,
  constraint claimed_rewards_pkey primary key (id),
  constraint claimed_rewards_reward_id_fkey foreign KEY (reward_id) references rewards (reward_id) on delete CASCADE,
  constraint claimed_rewards_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE
) TABLESPACE pg_default;
create table public.notifications (
  id serial not null,
  user_id integer not null,
  title character varying(255) not null,
  message text not null,
  is_read boolean null default false,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint notifications_pkey primary key (id),
  constraint notifications_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE
) TABLESPACE pg_default;
create table public.owner_recommendations (
  id serial not null,
  owner_id integer not null,
  product_id integer not null,
  recommended_product_id integer not null,
  score numeric not null,
  periods_constraint text null,
  created_at timestamp with time zone null default now(),
  constraint owner_recommendations_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_owner_recs_owner on public.owner_recommendations using btree (owner_id) TABLESPACE pg_default;

create index IF not exists idx_owner_recs_product on public.owner_recommendations using btree (product_id) TABLESPACE pg_default;
create table public.pending_transactions (
  id serial not null,
  short_code character varying(20) not null,
  reference_number character varying(100) not null,
  transaction_data jsonb not null,
  expires_at timestamp with time zone not null,
  used boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint pending_transactions_pkey primary key (id),
  constraint pending_transactions_reference_number_key unique (reference_number),
  constraint pending_transactions_short_code_key unique (short_code)
) TABLESPACE pg_default;

create index IF not exists idx_pending_transactions_short_code on public.pending_transactions using btree (short_code) TABLESPACE pg_default;

create index IF not exists idx_pending_transactions_expires_at on public.pending_transactions using btree (expires_at) TABLESPACE pg_default;

create index IF not exists idx_pending_transactions_used on public.pending_transactions using btree (used) TABLESPACE pg_default;
create table public.products (
  id serial not null,
  product_name text not null,
  price numeric(10, 2) not null,
  store_id integer not null,
  product_type text null,
  product_image text null,
  constraint products_pkey primary key (id),
  constraint products_product_name_key unique (product_name),
  constraint fk_products_store foreign KEY (store_id) references stores (store_id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_products_store_id on public.products using btree (store_id) TABLESPACE pg_default;
create table public.pending_transactions (
  id serial not null,
  short_code character varying(20) not null,
  reference_number character varying(100) not null,
  transaction_data jsonb not null,
  expires_at timestamp with time zone not null,
  used boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint pending_transactions_pkey primary key (id),
  constraint pending_transactions_reference_number_key unique (reference_number),
  constraint pending_transactions_short_code_key unique (short_code)
) TABLESPACE pg_default;

create index IF not exists idx_pending_transactions_short_code on public.pending_transactions using btree (short_code) TABLESPACE pg_default;

create index IF not exists idx_pending_transactions_expires_at on public.pending_transactions using btree (expires_at) TABLESPACE pg_default;

create index IF not exists idx_pending_transactions_used on public.pending_transactions using btree (used) TABLESPACE pg_default;
create table public.products (
  id serial not null,
  product_name text not null,
  price numeric(10, 2) not null,
  store_id integer not null,
  product_type text null,
  product_image text null,
  constraint products_pkey primary key (id),
  constraint products_product_name_key unique (product_name),
  constraint fk_products_store foreign KEY (store_id) references stores (store_id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_products_store_id on public.products using btree (store_id) TABLESPACE pg_default;
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
  discount_value numeric(10, 2) null,
  free_item_product_id integer null,
  buy_x_quantity integer null,
  buy_x_product_id integer null,
  get_y_quantity integer null,
  get_y_product_id integer null,
  constraint rewards_pkey primary key (reward_id),
  constraint rewards_promotion_code_key unique (promotion_code),
  constraint rewards_buy_x_product_id_fkey foreign KEY (buy_x_product_id) references products (id),
  constraint rewards_get_y_product_id_fkey foreign KEY (get_y_product_id) references products (id),
  constraint rewards_store_id_fkey foreign KEY (store_id) references stores (store_id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_rewards_promotion_code on public.rewards using btree (promotion_code) TABLESPACE pg_default;

create index IF not exists idx_rewards_dates on public.rewards using btree (start_date, end_date) TABLESPACE pg_default;

create trigger trigger_set_promotion_code BEFORE INSERT on rewards for EACH row
execute FUNCTION set_promotion_code ();

create trigger update_rewards_updated_at BEFORE
update on rewards for EACH row
execute FUNCTION update_updated_at_column ();
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
) TABLESPACE pg_default;
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
) TABLESPACE pg_default;

create index IF not exists idx_stores_owner_id on public.stores using btree (owner_id) TABLESPACE pg_default;

create trigger link_vendor_store_trigger
after INSERT
or
update on stores for EACH row
execute FUNCTION link_vendor_to_store ();

create trigger store_code_trigger BEFORE INSERT on stores for EACH row
execute FUNCTION generate_store_code ();

create trigger trg_set_inactive_since BEFORE
update OF is_active on stores for EACH row when (old.is_active is distinct from new.is_active)
execute FUNCTION set_inactive_since ();
create table public.transactions (
  id serial not null,
  transaction_date timestamp without time zone not null default now(),
  user_id integer null,
  store_id integer null,
  product_id integer not null,
  quantity integer not null,
  price numeric(10, 2) not null,
  total numeric GENERATED ALWAYS as (((quantity)::numeric * price)) STORED (10, 2) null,
  points numeric(10, 2) not null default 0,
  reference_number character varying(100) null,
  transaction_type text not null default 'Purchase'::text,
  "Vendor_ID" integer null,
  reward_id integer null,
  constraint transactions_pkey primary key (id),
  constraint fk_transactions_reward foreign KEY (reward_id) references rewards (reward_id) on delete set null,
  constraint fk_transactions_store foreign KEY (store_id) references stores (store_id) on delete set null,
  constraint fk_transactions_user foreign KEY (user_id) references users (user_id) on delete set null,
  constraint transactions_Vendor_ID_fkey foreign KEY ("Vendor_ID") references users (user_id) on update CASCADE on delete set null,
  constraint fk_transactions_product foreign KEY (product_id) references products (id) on delete RESTRICT,
  constraint transactions_quantity_check check ((quantity > 0)),
  constraint transactions_transaction_type_check check (
    (
      transaction_type = any (
        array[
          'Purchase'::text,
          'Redemption'::text,
          'Refund'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_transactions_user_id on public.transactions using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_transactions_store_id on public.transactions using btree (store_id) TABLESPACE pg_default;

create index IF not exists idx_transactions_product_id on public.transactions using btree (product_id) TABLESPACE pg_default;

create index IF not exists idx_transactions_date on public.transactions using btree (transaction_date) TABLESPACE pg_default;

create index IF not exists idx_transactions_reference_number on public.transactions using btree (reference_number) TABLESPACE pg_default;
create table public.user_logs (
  log_id serial not null,
  user_id integer null,
  login_time timestamp with time zone null default now(),
  username text null,
  constraint user_logs_pkey primary key (log_id),
  constraint user_logs_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE,
  constraint user_logs_username_fkey foreign KEY (username) references users (username) on delete CASCADE
) TABLESPACE pg_default;
create table public.user_points (
  id serial not null,
  user_id integer null,
  total_points integer null default 0,
  redeemed_points numeric(10, 2) null,
  store_id integer null,
  constraint user_points_pkey primary key (id),
  constraint user_points_store_id_fkey foreign KEY (store_id) references stores (store_id),
  constraint user_points_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE
) TABLESPACE pg_default;
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
  constraint users_username_key unique (username),
  constraint users_store_id_fkey foreign KEY (store_id) references stores (store_id) on update CASCADE on delete set null
) TABLESPACE pg_default;
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
  constraint users_username_key unique (username),
  constraint users_store_id_fkey foreign KEY (store_id) references stores (store_id) on update CASCADE on delete set null
) TABLESPACE pg_default;

create table public.notifications (
  id serial not null,
  user_id integer not null,
  title character varying(255) not null,
  message text not null,
  is_read boolean null default false,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint notifications_pkey primary key (id),
  constraint notifications_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE
) TABLESPACE pg_default;

create table public.users_dump (
  user_id integer not null default nextval('users_user_id_seq'::regclass),
  username character varying(50) not null,
  password character varying(255) not null,
  first_name character varying(50) null,
  last_name character varying(50) null,
  contact_number character varying(20) null,
  user_email text null,
  role text null default 'customer'::text,
  store_id integer null,
  profile_image text null,
  constraint users_dump_pkey primary key (user_id),
  constraint users_dump_user_email_key unique (user_email),
  constraint users_dump_username_key unique (username)
) TABLESPACE pg_default;