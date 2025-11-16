-- Add missing columns to rewards table
ALTER TABLE public.rewards 
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS promotion_code VARCHAR(20) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rewards_promotion_code 
ON public.rewards USING btree (promotion_code);

CREATE INDEX IF NOT EXISTS idx_rewards_dates 
ON public.rewards USING btree (start_date, end_date);

-- Create function to generate unique promotion code based on store name
CREATE OR REPLACE FUNCTION generate_promotion_code(p_store_id INTEGER)
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate promotion code on insert
CREATE OR REPLACE FUNCTION set_promotion_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.promotion_code IS NULL THEN
    NEW.promotion_code := generate_promotion_code(NEW.store_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_promotion_code ON public.rewards;

-- Create trigger to auto-generate promotion code on insert
CREATE TRIGGER trigger_set_promotion_code
BEFORE INSERT ON public.rewards
FOR EACH ROW
EXECUTE FUNCTION set_promotion_code();

-- Generate codes for existing promotions (only for rows without codes)
DO $$
DECLARE
  reward_record RECORD;
BEGIN
  FOR reward_record IN SELECT reward_id, store_id FROM public.rewards WHERE promotion_code IS NULL LOOP
    UPDATE public.rewards 
    SET promotion_code = generate_promotion_code(reward_record.store_id)
    WHERE reward_id = reward_record.reward_id;
  END LOOP;
END $$;

-- Add comment
COMMENT ON COLUMN public.rewards.promotion_code IS 'Unique code that customers use to redeem this promotion';
