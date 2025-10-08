// services/transactionService.js
import supabase from '../../config/db.js';
import { calculatePoints } from '../utils/points.js';
import { generateReferenceNumber } from '../utils/reference.js';

// --- Purchase ---
export async function handlePurchase({ store_id, transaction_date, product_name, quantity, price, user_id }) {
  const parsedQuantity = Number(quantity) || 0;
  const parsedPrice = Number(price) || 0;
  const total = Number((parsedQuantity * parsedPrice).toFixed(2));
  const points = calculatePoints(total);

  // Fetch store name
  const { data: storeRow } = await supabase
    .from('stores')
    .select('store_name')
    .eq('store_id', store_id)
    .single();

  const storeName = storeRow?.store_name || '';
  const reference_number = generateReferenceNumber(transaction_date, storeName);

  const payload = {
    store_id,
    transaction_date: transaction_date || new Date().toISOString(),
    product_name,
    quantity: parsedQuantity,
    price: parsedPrice,
    total,
    points,
    transaction_type: 'Purchase',
    reference_number,
    user_id
  };

  // Insert into transactions
  const { data, error } = await supabase
    .from('transactions')
    .insert([payload])
    .select('*')
    .single();

  if (error) throw error;

  // Update user points
  if (user_id) {
    const { data: userPts } = await supabase
      .from('user_points')
      .select('total_points')
      .eq('user_id', user_id)
      .maybeSingle();

    if (userPts) {
      const newTotal = (userPts.total_points || 0) + points;
      await supabase.from('user_points')
        .update({ total_points: newTotal })
        .eq('user_id', user_id);
    } else {
      await supabase.from('user_points')
        .insert([{ user_id, total_points: points, redeemed_points: 0 }]);
    }
  }

  return data;
}

// --- Redemption ---
export async function handleRedemption({ store_id, transaction_date, user_id, amount }) {
  if (!user_id) throw new Error('user_id is required for redemption');
  const cost = Number(amount) || 0;

  // Fetch user points
  const { data: userPts, error: ptsErr } = await supabase
    .from('user_points')
    .select('total_points, redeemed_points')
    .eq('user_id', user_id)
    .maybeSingle();

  if (ptsErr) throw ptsErr;
  if (!userPts || userPts.total_points < cost) throw new Error('Insufficient points');

  // Deduct points
  const newTotal = userPts.total_points - cost;
  const redeemed = (userPts.redeemed_points || 0) + cost;

  const payload = {
    store_id,
    transaction_date: transaction_date || new Date().toISOString(),
    total: cost,
    points: -cost,
    transaction_type: 'Redemption',
    reference_number: generateReferenceNumber(transaction_date, 'REDEEM'),
    user_id
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert([payload])
    .select('*')
    .single();

  if (error) throw error;

  await supabase.from('user_points')
    .update({ total_points: newTotal, redeemed_points: redeemed })
    .eq('user_id', user_id);

  return data;
}

// --- Refund ---
export async function handleRefund({ transaction_id, user_id }) {
  // Fetch the transaction to refund
  const { data: tx, error: fetchErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transaction_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!tx) throw new Error('Transaction not found');

  const payload = {
    store_id: tx.store_id,
    transaction_date: new Date().toISOString(),
    product_name: tx.product_name,
    quantity: tx.quantity,
    price: tx.price,
    total: -tx.total,
    points: -tx.points,
    transaction_type: 'Refund',
    reference_number: generateReferenceNumber(new Date(), 'REFUND'),
    user_id: tx.user_id || user_id
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert([payload])
    .select('*')
    .single();

  if (error) throw error;

  // Rollback points
  if (tx.user_id && tx.points) {
    const { data: userPts } = await supabase
      .from('user_points')
      .select('total_points')
      .eq('user_id', tx.user_id)
      .maybeSingle();

    if (userPts) {
      const newTotal = Math.max((userPts.total_points || 0) - tx.points, 0);
      await supabase.from('user_points')
        .update({ total_points: newTotal })
        .eq('user_id', tx.user_id);
    }
  }

  return data;
}
