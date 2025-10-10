-- Working Database Schema for SUKI Project
-- This includes the original structure with fixes applied

-- Create users table first (referenced by other tables)
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

-- Create stores table (fixed - single definition)
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

-- Create products table
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

-- Create transactions table (fixed syntax)
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

-- Create user_logs table
create table public.user_logs (
  log_id serial not null,
  user_id integer null,
  login_time timestamp with time zone null default now(),
  username text null,
  constraint admin_logs_pkey primary key (log_id),
  constraint user_logs_user_id_fkey foreign KEY (user_id) references users (user_id),
  constraint user_logs_username_fkey foreign KEY (username) references users (username)
) TABLESPACE pg_default;

-- Create user_points table
create table public.user_points (
  id serial not null,
  user_id integer null,
  total_points integer null default 0,
  redeemed_points numeric null,
  constraint user_points_pkey primary key (id),
  constraint user_points_user_id_fkey foreign KEY (user_id) references users (user_id)
) TABLESPACE pg_default;

-- Add missing tables that the backend code references
-- Create customers table (for redemptions)
CREATE TABLE public.customers (
  customer_id SERIAL PRIMARY KEY,
  customer_name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(20),
  points_balance INTEGER DEFAULT 0,
  total_points_earned INTEGER DEFAULT 0,
  total_points_redeemed INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create rewards table (for redemptions)
CREATE TABLE public.rewards (
  reward_id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  reward_name VARCHAR(100) NOT NULL,
  description TEXT,
  points_required INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_rewards_store FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE CASCADE
);

-- Create redemptions table
CREATE TABLE public.redemptions (
  redemption_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  reward_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  points_used INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  redemption_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_redemptions_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
  CONSTRAINT fk_redemptions_store FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE CASCADE,
  CONSTRAINT fk_redemptions_reward FOREIGN KEY (reward_id) REFERENCES rewards(reward_id) ON DELETE CASCADE,
  CONSTRAINT fk_redemptions_owner FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create transaction_items table (for detailed transaction items)
CREATE TABLE public.transaction_items (
  item_id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  total_price NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_transaction_items_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

-- Create required functions
CREATE OR REPLACE FUNCTION generate_store_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.store_code IS NULL OR NEW.store_code = '' THEN
    NEW.store_code := 'STORE-' || LPAD(NEW.store_id::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION link_vendor_to_store()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users 
  SET store_id = NEW.store_id 
  WHERE user_id = NEW.owner_id AND role = 'vendor';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER link_vendor_store_trigger
AFTER INSERT OR UPDATE ON stores FOR EACH ROW
EXECUTE FUNCTION link_vendor_to_store();

CREATE TRIGGER store_code_trigger 
BEFORE INSERT ON stores FOR EACH ROW
EXECUTE FUNCTION generate_store_code();

-- Add indexes for better performance
CREATE INDEX idx_stores_owner_id ON public.stores(owner_id);
CREATE INDEX idx_products_store_id ON public.products(store_id);
CREATE INDEX idx_transactions_store_id ON public.transactions(store_id);
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_date ON public.transactions(transaction_date);
CREATE INDEX idx_redemptions_customer_id ON public.redemptions(customer_id);
CREATE INDEX idx_redemptions_store_id ON public.redemptions(store_id);
CREATE INDEX idx_redemptions_owner_id ON public.redemptions(owner_id);

-- Insert sample data for testing
INSERT INTO public.users (username, password, first_name, last_name, role) VALUES
('admin', '$2b$10$example', 'Admin', 'User', 'admin'),
('owner1', '$2b$10$example', 'John', 'Doe', 'owner'),
('customer1', '$2b$10$example', 'Jane', 'Smith', 'customer')
ON CONFLICT (username) DO NOTHING;

-- Insert sample stores
INSERT INTO public.stores (owner_id, store_name, location, owner_name, owner_contact) VALUES
(2, 'Sample Store 1', 'Manila', 'John Doe', 1234567890),
(2, 'Sample Store 2', 'Quezon City', 'John Doe', 1234567890)
ON CONFLICT (store_name) DO NOTHING;

-- Insert sample products
INSERT INTO public.products (product_name, price, store_id, product_type) VALUES
('Sample Product 1', 100.00, 1, 'Food'),
('Sample Product 2', 200.00, 1, 'Beverage'),
('Sample Product 3', 150.00, 2, 'Snack')
ON CONFLICT (product_name) DO NOTHING;

-- Insert sample customers
INSERT INTO public.customers (customer_name, email, points_balance) VALUES
('Alice Johnson', 'alice@example.com', 500),
('Bob Wilson', 'bob@example.com', 300)
ON CONFLICT DO NOTHING;

-- Insert sample rewards
INSERT INTO public.rewards (store_id, reward_name, description, points_required) VALUES
(1, 'Free Coffee', 'Get a free coffee with 100 points', 100),
(1, '10% Discount', 'Get 10% off your next purchase', 200),
(2, 'Free Snack', 'Get a free snack with 150 points', 150)
ON CONFLICT DO NOTHING;
