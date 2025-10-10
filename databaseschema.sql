create table public.products (
  id serial not null,
  product_name text not null,
  price numeric(10, 2) not null,
  store_id integer not null,
  product_type text null,
  constraint products_pkey primary key (id),
  constraint products_product_name_key unique (product_name),
  constraint fk_products_store foreign KEY (store_id) references stores (store_id) on delete CASCADE
) TABLESPACE pg_default;

create table public.stores (
  owner_id serial not null,
  store_name character varying(100) not null,
  location character varying(100) null,
  is_active boolean null default true,
  store_code text null,
  store_image text null,
  owner_name text null,
  owner_contact numeric null,
  store_id integer not null,
  constraint stores_pkey primary key (store_id),
  constraint stores_store_code_key unique (store_code),
  constraint stores_store_name_key unique (store_name),
  constraint stores_owner_id_fkey foreign KEY (owner_id) references users (user_id) on delete CASCADE
) TABLESPACE pg_default;

create trigger link_vendor_store_trigger
after INSERT
or
update on stores for EACH row
execute FUNCTION link_vendor_to_store ();

create trigger store_code_trigger BEFORE INSERT on stores for EACH row
execute FUNCTION generate_store_code ();

create table public.transactions (
  id serial not null,
  transaction_date timestamp without time zone not null default now(),
  user_id integer null,
  store_id integer null,
  product_id integer not null,
  quantity integer not null,
  price numeric(10, 2) not null,
  total numeric GENERATED ALWAYS as (((quantity)::numeric * price)) STORED,
  points integer not null default 0,
  reference_number character varying(100) null,
  transaction_type text not null default 'Purchase'::text,
  constraint transactions_pkey primary key (id),
  constraint transactions_reference_number_key unique (reference_number),
  constraint fk_transactions_store foreign KEY (store_id) references stores (store_id) on delete set null,
  constraint fk_transactions_user foreign KEY (user_id) references users (user_id) on delete set null,
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

create table public.user_logs (
  log_id serial not null,
  user_id integer null,
  login_time timestamp with time zone null default now(),
  username text null,
  constraint admin_logs_pkey primary key (log_id),
  constraint user_logs_user_id_fkey foreign KEY (user_id) references users (user_id),
  constraint user_logs_username_fkey foreign KEY (username) references users (username)
) TABLESPACE pg_default;

create table public.user_points (
  id serial not null,
  user_id integer null,
  total_points integer null default 0,
  redeemed_points numeric null,
  constraint user_points_pkey primary key (id),
  constraint user_points_user_id_fkey foreign KEY (user_id) references users (user_id)
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
  constraint users_pkey primary key (user_id),
  constraint users_user_email_key unique (user_email),
  constraint users_username_key unique (username),
  constraint users_store_id_fkey foreign KEY (store_id) references stores (store_id) on update CASCADE on delete set null
) TABLESPACE pg_default;