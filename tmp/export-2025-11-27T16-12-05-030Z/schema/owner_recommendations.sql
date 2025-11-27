CREATE TABLE public.owner_recommendations (
  "id" serial not null NOT NULL,
  "owner_id" integer not null NOT NULL,
  "product_id" integer not null NOT NULL,
  "recommended_product_id" integer not null NOT NULL,
  "score" numeric not null NOT NULL,
  "periods_constraint" text null,
  "created_at" timestamp
);
