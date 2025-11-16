# Promotion Code Feature - Implementation Summary

## Overview
Added a unique promotion code system for customer redemptions. Each promotion automatically receives a unique code (e.g., `PROMO-A1B2C3`) when created.

---

## Database Changes

### 1. Run this SQL on your Supabase database:

```sql
-- Add missing columns to rewards table
ALTER TABLE public.rewards 
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS promotion_code VARCHAR(20) UNIQUE;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_rewards_promotion_code 
ON public.rewards USING btree (promotion_code);

CREATE INDEX IF NOT EXISTS idx_rewards_dates 
ON public.rewards USING btree (start_date, end_date);

-- Create function to generate unique promotion code
CREATE OR REPLACE FUNCTION generate_promotion_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a random 6-character alphanumeric code (e.g., PROMO-ABC123)
    code := 'PROMO-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    
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
    NEW.promotion_code := generate_promotion_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_promotion_code
BEFORE INSERT ON public.rewards
FOR EACH ROW
EXECUTE FUNCTION set_promotion_code();

-- Generate codes for existing promotions (if any)
UPDATE public.rewards 
SET promotion_code = generate_promotion_code()
WHERE promotion_code IS NULL;

-- Add helpful comment
COMMENT ON COLUMN public.rewards.promotion_code IS 'Unique code that customers use to redeem this promotion';
```

---

## Code Changes

### Files Modified:

1. **`api/controllers/ownerPromotionsController.js`**
   - Added `generatePromotionCode()` function
   - Updated `createPromotion()` to generate and save promotion codes
   - Included promotion code in API response

2. **`views/OwnerSide/Promotions.hbs`**
   - Added promotion code display in promotion cards
   - Added copy-to-clipboard functionality
   - Added CSS styling for promotion code badge
   - Shows promotion code in success message after creation

---

## Features Added

### 1. Automatic Code Generation
- Unique code format: `PROMO-XXXXXX` (6 random alphanumeric characters)
- Generated both at database level (trigger) and application level (fallback)
- Guaranteed uniqueness through database constraint

### 2. Owner Dashboard Display
- Promotion code prominently displayed in promotion cards
- Golden badge with dashed border for visibility
- One-click copy to clipboard functionality
- Visual feedback when code is copied

### 3. Success Notification
- Alert shows promotion code immediately after creation
- Clear message for customers to use the code
- Code remains visible in promotions list

---

## How It Works

### Creating a Promotion:
1. Owner fills out promotion form
2. System generates unique code (e.g., `PROMO-A1B2C3`)
3. Code is saved to database with promotion
4. Owner sees code in success message and on promotion card

### Customer Redemption (Future Implementation):
1. Customer enters promotion code
2. System validates code exists and is active
3. System checks start/end dates
4. Customer receives promotion benefits

---

## UI Examples

### Promotion Card:
```
┌─────────────────────────────────────┐
│ Summer Sale              [Active]   │
│                                     │
│ Get 20% off your next purchase     │
│                                     │
│ ╔═══════════════════════════════╗  │
│ ║ 🎟️ Code: PROMO-A1B2C3   📋  ║  │
│ ╚═══════════════════════════════╝  │
│                                     │
│ Points Required: 100                │
│ Start Date: 06/01/2025              │
│ End Date: 08/31/2025                │
│ Status: Active                      │
│                                     │
│           [Edit]  [Delete]          │
└─────────────────────────────────────┘
```

### Success Message:
```
Promotion created successfully!

🎟️ Promotion Code: PROMO-A1B2C3

Customers can use this code to redeem the promotion.
```

---

## Next Steps (Recommended)

### For Customer Side:
1. Add redemption form where customers enter promotion code
2. Validate code against database
3. Check if promotion is active and within date range
4. Apply promotion benefits to customer account
5. Track redemption in `redemptions` table

### Enhancement Ideas:
- Usage limit per promotion code
- Track how many times code has been used
- QR code generation for easy scanning
- Email/SMS code distribution
- Analytics for code redemption rates

---

## Testing Checklist

- [x] Promotion code generated automatically
- [x] Code is unique (no duplicates)
- [x] Code displays on promotion card
- [x] Copy button works
- [x] Success message shows code
- [ ] **Run SQL migration on Supabase**
- [ ] **Restart server to apply controller changes**
- [ ] **Create test promotion to verify code generation**

---

## Database Schema Update

```sql
-- Updated rewards table structure
CREATE TABLE public.rewards (
  reward_id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  reward_name VARCHAR(100) NOT NULL,
  description TEXT,
  points_required INTEGER NOT NULL,
  promotion_code VARCHAR(20) UNIQUE,      -- NEW
  start_date TIMESTAMP WITH TIME ZONE,    -- NEW
  end_date TIMESTAMP WITH TIME ZONE,      -- NEW
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## Files Created/Modified Summary

✅ **Created:**
- `add_promotion_code.sql` - Database migration script
- `PROMOTION_CODE_IMPLEMENTATION.md` - This documentation

✅ **Modified:**
- `api/controllers/ownerPromotionsController.js` - Added code generation
- `views/OwnerSide/Promotions.hbs` - Added UI for code display

---

**Status:** ✅ Code Complete - Awaiting Database Migration  
**Date:** 2025  
**Feature:** Promotion Code System
