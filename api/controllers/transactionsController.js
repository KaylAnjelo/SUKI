// controllers/transactionsController.js
import supabase from '../../config/db.js';
import { calculatePoints } from '../utils/points.js';
import { generateReferenceNumber } from '../utils/reference.js';

/**
 * CREATE Transaction (handles Purchase, Redemption, Refund)
 */
export const createTransaction = async (req, res) => {
  try {
    const {
      store_id,
      user_id,
      product_id,
      quantity,
      price,
      transaction_type = 'Purchase',
    } = req.body || {};

    if (!store_id) return res.status(400).json({ error: 'store_id is required' });
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });

    const parsedQuantity = Number(quantity) || 0;
    const parsedPrice = Number(price) || 0;

    if (parsedQuantity <= 0) {
      return res.status(400).json({ error: 'quantity must be greater than 0' });
    }

    // Join store name for reference number
    const { data: storeRow, error: storeErr } = await supabase
      .from('stores')
      .select('store_name')
      .eq('store_id', store_id)
      .single();
    if (storeErr) throw storeErr;

    const storeName = storeRow?.store_name || '';
    const ref = generateReferenceNumber(new Date().toISOString(), storeName);

    // Calculate points (only for purchases, not redemptions/refunds)
    const points = transaction_type === 'Purchase'
      ? calculatePoints(parsedQuantity * parsedPrice)
      : 0;

    const payload = {
      store_id,
      user_id,
      product_id,
      quantity: parsedQuantity,
      price: parsedPrice,
      transaction_type,
      reference_number: ref,
      points,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert([payload])
      .select(`
        *,
        products (product_name),
        users (username),
        stores (store_name)
      `)
      .single();

    if (error) throw error;

    // Handle points updates for Purchase/Redemption
    if (user_id) {
      const { data: userPts } = await supabase
        .from('user_points')
        .select('user_id, total_points, redeemed_points')
        .eq('user_id', user_id)
        .maybeSingle();

      if (transaction_type === 'Purchase') {
        const newTotal = (userPts?.total_points || 0) + points;
        if (userPts) {
          await supabase.from('user_points')
            .update({ total_points: newTotal })
            .eq('user_id', user_id);
        } else {
          await supabase.from('user_points')
            .insert([{ user_id, total_points: points, redeemed_points: 0 }]);
        }
      } else if (transaction_type === 'Redemption') {
        const redeemCost = parsedQuantity * parsedPrice;
        if (!userPts || userPts.total_points < redeemCost) {
          return res.status(400).json({ error: 'Not enough points to redeem' });
        }
        await supabase.from('user_points')
          .update({
            total_points: userPts.total_points - redeemCost,
            redeemed_points: (userPts.redeemed_points || 0) + redeemCost,
          })
          .eq('user_id', user_id);
      }
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Error creating transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET all transactions
 */
export const getTransactions = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        products (product_name),
        users (username),
        stores (store_name)
      `)
      .order('transaction_date', { ascending: false });

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET transaction by ID
 */
export const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        products (product_name),
        users (username),
        stores (store_name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * UPDATE transaction
 */
export const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body;

    const { data, error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', id)
      .select(`
        *,
        products (product_name),
        users (username),
        stores (store_name)
      `)
      .single();

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error('Error updating transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE transaction
 */
export const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return res.status(204).send(); // No content
  } catch (err) {
    console.error('Error deleting transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};
