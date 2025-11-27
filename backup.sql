

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cleanup_expired_pending_transactions"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM public.pending_transactions
  WHERE expires_at < NOW() AND used = FALSE;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_pending_transactions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_promotion_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a random 8-character alphanumeric code (e.g., PROMO-ABC123)
    code := 'PROMO-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM rewards WHERE promotion_code = code) INTO exists;
    
    -- If code doesn't exist, return it
    IF NOT exists THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_promotion_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_promotion_code"("p_store_id" integer) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
  store_prefix TEXT;
  random_digits TEXT;
BEGIN
  -- Get first 4 letters of store name (uppercase, remove spaces)
  SELECT upper(regexp_replace(substring(store_name from 1 for 4), '[^A-Za-z]', '', 'g'))
  INTO store_prefix
  FROM stores
  WHERE store_id = p_store_id;
  
  -- If store_prefix is less than 4 chars, pad with 'X'
  store_prefix := rpad(COALESCE(store_prefix, 'STOR'), 4, 'X');
  
  LOOP
    -- Generate 6 random digits
    random_digits := lpad(floor(random() * 1000000)::text, 6, '0');
    
    -- Combine: RAKS123456
    code := store_prefix || random_digits;
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM rewards WHERE promotion_code = code) INTO exists;
    
    -- If code doesn't exist, return it
    IF NOT exists THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_promotion_code"("p_store_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_store_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN := TRUE;
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    i INTEGER;
BEGIN
    -- Only generate code if store_code is NULL
    IF NEW.store_code IS NULL THEN
        -- Keep generating until we get a unique code
        WHILE code_exists LOOP
            new_code := '';
            
            -- Generate 6 random characters
            FOR i IN 1..6 LOOP
                new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
            END LOOP;
            
            -- Check if the generated code already exists
            SELECT EXISTS(
                SELECT 1 FROM stores 
                WHERE store_code = new_code
            ) INTO code_exists;
        END LOOP;
        
        -- Set the generated code
        NEW.store_code := new_code;
    ELSE
        -- If store_code was manually provided, ensure it's uppercase
        NEW.store_code := UPPER(NEW.store_code);
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_store_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_vendor_to_store"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE users 
  SET store_id = NEW.store_id 
  WHERE user_id = NEW.owner_id AND role = 'vendor';
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."link_vendor_to_store"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_admin_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO admin_logs(admin_id, action)
  values (NEW.id, 'New admin added');
  return new;
END;
$$;


ALTER FUNCTION "public"."log_admin_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_inactive_since"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- When store is deactivated
  IF NEW.is_active = false AND OLD.is_active = true THEN
    NEW.inactive_since := now();
  END IF;

  -- When store is re-activated
  IF NEW.is_active = true AND OLD.is_active = false THEN
    NEW.inactive_since := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_inactive_since"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_promotion_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.promotion_code IS NULL THEN
    NEW.promotion_code := generate_promotion_code(NEW.store_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_promotion_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_reference_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  store_code text;
begin
  -- Fetch store code for reference (fallback to 'GEN' if not found)
  select s.store_code
  into store_code
  from stores s
  where s.store_id = new.store_id;

  if store_code is null then
    store_code := 'GEN'; -- fallback prefix
  end if;

  -- Generate reference: STORECODE-YYYYMMDD-RANDOM
  new.reference_number := store_code || '-' ||
                          to_char(current_date, 'YYYYMMDD') || '-' ||
                          lpad(nextval('transactions_id_seq')::text, 6, '0');

  return new;
end;
$$;


ALTER FUNCTION "public"."set_reference_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_expired_promotions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Update promotions that have passed their end date
  UPDATE public.promotions 
  SET status = 'expired' 
  WHERE end_date < NOW() AND status IN ('active', 'scheduled');
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_expired_promotions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_promotions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_promotions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."pending_transactions" (
    "id" integer NOT NULL,
    "short_code" character varying(20) NOT NULL,
    "reference_number" character varying(100) NOT NULL,
    "transaction_data" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pending_transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."active_pending_transactions" AS
 SELECT "id",
    "short_code",
    "reference_number",
    "transaction_data",
    "expires_at",
    "used",
    "created_at"
   FROM "public"."pending_transactions"
  WHERE (("used" = false) AND ("expires_at" > "now"()));


ALTER VIEW "public"."active_pending_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."claimed_rewards" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "reward_id" integer NOT NULL,
    "claimed_at" timestamp with time zone DEFAULT "now"(),
    "is_redeemed" boolean DEFAULT false
);


ALTER TABLE "public"."claimed_rewards" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."claimed_rewards_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."claimed_rewards_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."claimed_rewards_id_seq" OWNED BY "public"."claimed_rewards"."id";



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "title" character varying(255) NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."notifications_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."notifications_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."notifications_id_seq" OWNED BY "public"."notifications"."id";



CREATE TABLE IF NOT EXISTS "public"."owner_recommendations" (
    "id" integer NOT NULL,
    "owner_id" integer NOT NULL,
    "product_id" integer NOT NULL,
    "recommended_product_id" integer NOT NULL,
    "score" numeric NOT NULL,
    "periods_constraint" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."owner_recommendations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."owner_recommendations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."owner_recommendations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."owner_recommendations_id_seq" OWNED BY "public"."owner_recommendations"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."pending_transactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pending_transactions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pending_transactions_id_seq" OWNED BY "public"."pending_transactions"."id";



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" integer NOT NULL,
    "product_name" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "store_id" integer NOT NULL,
    "product_type" "text",
    "product_image" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."products_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."products_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."products_id_seq" OWNED BY "public"."products"."id";



CREATE TABLE IF NOT EXISTS "public"."rewards" (
    "reward_id" integer NOT NULL,
    "store_id" integer NOT NULL,
    "reward_name" character varying(100) NOT NULL,
    "description" "text",
    "points_required" integer NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "promotion_code" character varying(20),
    "reward_type" "text" DEFAULT 'generic'::"text",
    "discount_value" numeric(10,2),
    "free_item_product_id" integer,
    "buy_x_quantity" integer,
    "buy_x_product_id" integer,
    "get_y_quantity" integer,
    "get_y_product_id" integer
);


ALTER TABLE "public"."rewards" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rewards"."promotion_code" IS 'Unique code that customers use to redeem this promotion';



CREATE SEQUENCE IF NOT EXISTS "public"."rewards_reward_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rewards_reward_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rewards_reward_id_seq" OWNED BY "public"."rewards"."reward_id";



CREATE TABLE IF NOT EXISTS "public"."store_dump" (
    "dump_id" integer NOT NULL,
    "store_id" integer NOT NULL,
    "owner_id" integer NOT NULL,
    "store_name" character varying(100) NOT NULL,
    "location" character varying(100),
    "store_code" "text",
    "store_image" "text",
    "owner_name" "text",
    "owner_contact" character varying(20),
    "dumped_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."store_dump" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."store_dump_dump_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."store_dump_dump_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."store_dump_dump_id_seq" OWNED BY "public"."store_dump"."dump_id";



CREATE TABLE IF NOT EXISTS "public"."stores" (
    "store_id" integer NOT NULL,
    "owner_id" integer NOT NULL,
    "store_name" character varying(100) NOT NULL,
    "location" character varying(100),
    "is_active" boolean DEFAULT true,
    "store_code" "text",
    "store_image" "text",
    "owner_name" "text",
    "owner_contact" character varying(20),
    "inactive_since" timestamp without time zone
);


ALTER TABLE "public"."stores" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."stores_store_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stores_store_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stores_store_id_seq" OWNED BY "public"."stores"."store_id";



CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" integer NOT NULL,
    "transaction_date" timestamp without time zone DEFAULT "now"() NOT NULL,
    "user_id" integer,
    "store_id" integer,
    "product_id" integer NOT NULL,
    "quantity" integer NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "total" numeric(10,2) GENERATED ALWAYS AS ((("quantity")::numeric * "price")) STORED,
    "points" numeric(10,2) DEFAULT 0 NOT NULL,
    "reference_number" character varying(100),
    "transaction_type" "text" DEFAULT 'Purchase'::"text" NOT NULL,
    "Vendor_ID" integer,
    "reward_id" integer,
    CONSTRAINT "transactions_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['Purchase'::"text", 'Redemption'::"text", 'Refund'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transactions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transactions_id_seq" OWNED BY "public"."transactions"."id";



CREATE TABLE IF NOT EXISTS "public"."user_logs" (
    "log_id" integer NOT NULL,
    "user_id" integer,
    "login_time" timestamp with time zone DEFAULT "now"(),
    "username" "text"
);


ALTER TABLE "public"."user_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_logs_log_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_logs_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_logs_log_id_seq" OWNED BY "public"."user_logs"."log_id";



CREATE TABLE IF NOT EXISTS "public"."user_points" (
    "id" integer NOT NULL,
    "user_id" integer,
    "total_points" integer DEFAULT 0,
    "redeemed_points" numeric(10,2),
    "store_id" integer
);


ALTER TABLE "public"."user_points" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_points"."store_id" IS 'Store id of user points';



CREATE SEQUENCE IF NOT EXISTS "public"."user_points_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_points_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_points_id_seq" OWNED BY "public"."user_points"."id";



CREATE TABLE IF NOT EXISTS "public"."users" (
    "user_id" integer NOT NULL,
    "username" character varying(50) NOT NULL,
    "password" character varying(255) NOT NULL,
    "first_name" character varying(50),
    "last_name" character varying(50),
    "contact_number" character varying(20),
    "user_email" "text",
    "role" "text" DEFAULT 'customer'::"text",
    "store_id" integer,
    "profile_image" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."users_user_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."users_user_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."users_user_id_seq" OWNED BY "public"."users"."user_id";



CREATE TABLE IF NOT EXISTS "public"."users_dump" (
    "user_id" integer DEFAULT "nextval"('"public"."users_user_id_seq"'::"regclass") NOT NULL,
    "username" character varying(50) NOT NULL,
    "password" character varying(255) NOT NULL,
    "first_name" character varying(50),
    "last_name" character varying(50),
    "contact_number" character varying(20),
    "user_email" "text",
    "role" "text" DEFAULT 'customer'::"text",
    "store_id" integer,
    "profile_image" "text",
    "deleted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users_dump" OWNER TO "postgres";


ALTER TABLE ONLY "public"."claimed_rewards" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."claimed_rewards_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."notifications" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notifications_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."owner_recommendations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."owner_recommendations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pending_transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pending_transactions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."products" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."products_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rewards" ALTER COLUMN "reward_id" SET DEFAULT "nextval"('"public"."rewards_reward_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."store_dump" ALTER COLUMN "dump_id" SET DEFAULT "nextval"('"public"."store_dump_dump_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stores" ALTER COLUMN "store_id" SET DEFAULT "nextval"('"public"."stores_store_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transactions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_logs" ALTER COLUMN "log_id" SET DEFAULT "nextval"('"public"."user_logs_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_points" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_points_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."users" ALTER COLUMN "user_id" SET DEFAULT "nextval"('"public"."users_user_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."claimed_rewards"
    ADD CONSTRAINT "claimed_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owner_recommendations"
    ADD CONSTRAINT "owner_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_transactions"
    ADD CONSTRAINT "pending_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_transactions"
    ADD CONSTRAINT "pending_transactions_reference_number_key" UNIQUE ("reference_number");



ALTER TABLE ONLY "public"."pending_transactions"
    ADD CONSTRAINT "pending_transactions_short_code_key" UNIQUE ("short_code");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_product_name_key" UNIQUE ("product_name");



ALTER TABLE ONLY "public"."rewards"
    ADD CONSTRAINT "rewards_pkey" PRIMARY KEY ("reward_id");



ALTER TABLE ONLY "public"."rewards"
    ADD CONSTRAINT "rewards_promotion_code_key" UNIQUE ("promotion_code");



ALTER TABLE ONLY "public"."store_dump"
    ADD CONSTRAINT "store_dump_pkey" PRIMARY KEY ("dump_id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("store_id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_store_code_key" UNIQUE ("store_code");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_store_name_key" UNIQUE ("store_name");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_logs"
    ADD CONSTRAINT "user_logs_pkey" PRIMARY KEY ("log_id");



ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users_dump"
    ADD CONSTRAINT "users_dump_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_user_email_key" UNIQUE ("user_email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



CREATE INDEX "idx_owner_recs_owner" ON "public"."owner_recommendations" USING "btree" ("owner_id");



CREATE INDEX "idx_owner_recs_product" ON "public"."owner_recommendations" USING "btree" ("product_id");



CREATE INDEX "idx_pending_transactions_expires_at" ON "public"."pending_transactions" USING "btree" ("expires_at");



CREATE INDEX "idx_pending_transactions_short_code" ON "public"."pending_transactions" USING "btree" ("short_code");



CREATE INDEX "idx_pending_transactions_used" ON "public"."pending_transactions" USING "btree" ("used");



CREATE INDEX "idx_products_store_id" ON "public"."products" USING "btree" ("store_id");



CREATE INDEX "idx_rewards_dates" ON "public"."rewards" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_rewards_promotion_code" ON "public"."rewards" USING "btree" ("promotion_code");



CREATE INDEX "idx_stores_owner_id" ON "public"."stores" USING "btree" ("owner_id");



CREATE INDEX "idx_transactions_date" ON "public"."transactions" USING "btree" ("transaction_date");



CREATE INDEX "idx_transactions_product_id" ON "public"."transactions" USING "btree" ("product_id");



CREATE INDEX "idx_transactions_reference_number" ON "public"."transactions" USING "btree" ("reference_number");



CREATE INDEX "idx_transactions_store_id" ON "public"."transactions" USING "btree" ("store_id");



CREATE INDEX "idx_transactions_user_id" ON "public"."transactions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "link_vendor_store_trigger" AFTER INSERT OR UPDATE ON "public"."stores" FOR EACH ROW EXECUTE FUNCTION "public"."link_vendor_to_store"();



CREATE OR REPLACE TRIGGER "store_code_trigger" BEFORE INSERT ON "public"."stores" FOR EACH ROW EXECUTE FUNCTION "public"."generate_store_code"();



CREATE OR REPLACE TRIGGER "trg_set_inactive_since" BEFORE UPDATE OF "is_active" ON "public"."stores" FOR EACH ROW WHEN (("old"."is_active" IS DISTINCT FROM "new"."is_active")) EXECUTE FUNCTION "public"."set_inactive_since"();



CREATE OR REPLACE TRIGGER "trigger_set_promotion_code" BEFORE INSERT ON "public"."rewards" FOR EACH ROW EXECUTE FUNCTION "public"."set_promotion_code"();



CREATE OR REPLACE TRIGGER "update_rewards_updated_at" BEFORE UPDATE ON "public"."rewards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."claimed_rewards"
    ADD CONSTRAINT "claimed_rewards_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("reward_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."claimed_rewards"
    ADD CONSTRAINT "claimed_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "fk_products_store" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("store_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "fk_transactions_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "fk_transactions_reward" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("reward_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "fk_transactions_store" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("store_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "fk_transactions_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rewards"
    ADD CONSTRAINT "rewards_buy_x_product_id_fkey" FOREIGN KEY ("buy_x_product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."rewards"
    ADD CONSTRAINT "rewards_get_y_product_id_fkey" FOREIGN KEY ("get_y_product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."rewards"
    ADD CONSTRAINT "rewards_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("store_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_Vendor_ID_fkey" FOREIGN KEY ("Vendor_ID") REFERENCES "public"."users"("user_id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_logs"
    ADD CONSTRAINT "user_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_logs"
    ADD CONSTRAINT "user_logs_username_fkey" FOREIGN KEY ("username") REFERENCES "public"."users"("username") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("store_id");



ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("store_id") ON UPDATE CASCADE ON DELETE SET NULL;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."cleanup_expired_pending_transactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_pending_transactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_pending_transactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_promotion_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_promotion_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_promotion_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_promotion_code"("p_store_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_promotion_code"("p_store_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_promotion_code"("p_store_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_store_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_store_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_store_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."link_vendor_to_store"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_vendor_to_store"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_vendor_to_store"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_admin_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_admin_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_admin_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_inactive_since"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_inactive_since"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_inactive_since"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_promotion_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_promotion_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_promotion_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_reference_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_reference_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_reference_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_expired_promotions"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_expired_promotions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_expired_promotions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_promotions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_promotions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_promotions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."pending_transactions" TO "anon";
GRANT ALL ON TABLE "public"."pending_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."active_pending_transactions" TO "anon";
GRANT ALL ON TABLE "public"."active_pending_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."active_pending_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."claimed_rewards" TO "anon";
GRANT ALL ON TABLE "public"."claimed_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."claimed_rewards" TO "service_role";



GRANT ALL ON SEQUENCE "public"."claimed_rewards_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."claimed_rewards_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."claimed_rewards_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."owner_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."owner_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."owner_recommendations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."owner_recommendations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."owner_recommendations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."owner_recommendations_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pending_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pending_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pending_transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rewards" TO "anon";
GRANT ALL ON TABLE "public"."rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."rewards" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rewards_reward_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rewards_reward_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rewards_reward_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."store_dump" TO "anon";
GRANT ALL ON TABLE "public"."store_dump" TO "authenticated";
GRANT ALL ON TABLE "public"."store_dump" TO "service_role";



GRANT ALL ON SEQUENCE "public"."store_dump_dump_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."store_dump_dump_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."store_dump_dump_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stores" TO "anon";
GRANT ALL ON TABLE "public"."stores" TO "authenticated";
GRANT ALL ON TABLE "public"."stores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stores_store_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stores_store_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stores_store_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_logs" TO "anon";
GRANT ALL ON TABLE "public"."user_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_logs_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_logs_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_logs_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_points" TO "anon";
GRANT ALL ON TABLE "public"."user_points" TO "authenticated";
GRANT ALL ON TABLE "public"."user_points" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_points_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_points_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_points_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."users_user_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."users_user_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."users_user_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users_dump" TO "anon";
GRANT ALL ON TABLE "public"."users_dump" TO "authenticated";
GRANT ALL ON TABLE "public"."users_dump" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























