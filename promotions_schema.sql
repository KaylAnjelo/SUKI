-- Promotions table for managing store discounts and special offers
CREATE TABLE IF NOT EXISTS public.promotions (
  promotion_id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'buy_x_get_y')),
  discount_value DECIMAL(10,2) NOT NULL,
  min_purchase_amount DECIMAL(10,2) DEFAULT 0,
  max_discount_amount DECIMAL(10,2),
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'scheduled', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_promotions_store FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE CASCADE,
  CONSTRAINT promotions_discount_value_check CHECK (discount_value > 0),
  CONSTRAINT promotions_dates_check CHECK (end_date > start_date),
  CONSTRAINT promotions_usage_limit_check CHECK (usage_limit IS NULL OR usage_limit > 0)
);

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_promotions_store_id ON public.promotions(store_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON public.promotions(status);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON public.promotions(start_date, end_date);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_promotions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW
  EXECUTE FUNCTION update_promotions_updated_at();

-- Function to automatically set status to 'expired' for past promotions
CREATE OR REPLACE FUNCTION update_expired_promotions()
RETURNS TRIGGER AS $$
BEGIN
  -- Update promotions that have passed their end date
  UPDATE public.promotions 
  SET status = 'expired' 
  WHERE end_date < NOW() AND status IN ('active', 'scheduled');
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run the expiration check (can be called periodically)
-- This would typically be run by a cron job or scheduled task
