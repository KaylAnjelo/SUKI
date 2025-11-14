-- Fix for products table primary key sequence issue
-- Run this in your Supabase SQL editor to fix the auto-increment sequence

-- Reset the sequence to the maximum ID + 1
SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM products));

-- Verify the sequence current value
SELECT currval('products_id_seq') as current_sequence_value;

-- Check current max ID in products table
SELECT MAX(id) as max_product_id FROM products;