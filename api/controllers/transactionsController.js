import supabase from '../../config/db.js';
import { calculatePoints } from '../utils/points.js';
import { generateReferenceNumber } from '../utils/reference.js';

export const createTransaction = async (req, res) => {
  try {
    const {
      store_id,
      transaction_date,
      product_name,
      quantity,
      price,
      user_id
    } = req.body || {};

    if (!store_id) return res.status(400).json({ error: 'store_id is required' });
    if (!product_name) return res.status(400).json({ error: 'product_name is required' });

    const parsedQuantity = Number(quantity) || 0;
    const parsedPrice = Number(price) || 0;
    const total = Number((parsedQuantity * parsedPrice).toFixed(2));
    const points = calculatePoints(total);
    
    // Look up store name for reference prefix
    const { data: storeRow } = await supabase
      .from('stores')
      .select('store_name')
      .eq('owner_id', store_id)
      .single();

    const storeName = storeRow?.store_name || '';

    // Always generate server-side reference number (ignore any client-provided value)
    const ref = generateReferenceNumber(transaction_date, storeName);

    const payload = {
      store_id,
      transaction_date: transaction_date || new Date().toISOString().slice(0, 10),
      product_name,
      quantity: parsedQuantity,
      price: parsedPrice,
      total,
      points,
      reference_number: ref,
      user_id
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;

    // Upsert into user_points for this user
    if (user_id) {
      const { data: userPts } = await supabase
        .from('user_points')
        .select('user_id, total_points, redeemed_points')
        .eq('user_id', user_id)
        .maybeSingle();

      if (userPts) {
        const newTotal = (userPts.total_points || 0) + points;
        const { error: updateErr } = await supabase
          .from('user_points')
          .update({ total_points: newTotal })
          .eq('user_id', user_id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('user_points')
          .insert([{ user_id, total_points: points, redeemed_points: 0 }]);
        if (insertErr) throw insertErr;
      }
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Error creating transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};

