// controllers/transactionsController.js
import supabase from '../../config/db.js';
import { calculatePoints } from '../utils/points.js';
import { generateReferenceNumber } from '../utils/reference.js';

/**
 * CREATE Transaction (handles Purchase, Redemption, Refund)
 */
export const createTransaction = async (req, res) => {
  try {
    const { store_id, user_id, products = [], transaction_type = 'Purchase' } = req.body || {};

    if (!store_id) return res.status(400).json({ error: 'store_id is required' });
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'products must be a non-empty array' });
    }

    // Get store name for reference
    const { data: storeRow, error: storeErr } = await supabase
      .from('stores')
      .select('store_name')
      .eq('store_id', store_id)
      .single();
    if (storeErr) throw storeErr;

    const storeName = storeRow?.store_name || '';
    const ref = generateReferenceNumber(new Date().toISOString(), storeName);

    let totalAmount = 0;
    const payloads = [];

    // First pass: validate and calculate total
    for (const item of products) {
      const parsedQuantity = Number(item.quantity) || 0;
      const parsedPrice = Number(item.price) || 0;

      if (!item.product_id) {
        return res.status(400).json({ error: 'Each product must have a product_id' });
      }
      if (parsedQuantity <= 0) {
        return res.status(400).json({ error: 'quantity must be greater than 0' });
      }

      totalAmount += parsedQuantity * parsedPrice;
    }

    // Calculate points based on total transaction amount
    const totalPoints = transaction_type === 'Purchase' ? calculatePoints(totalAmount) : 0;

    // Second pass: create payloads with distributed points
    for (const item of products) {
      const parsedQuantity = Number(item.quantity) || 0;
      const parsedPrice = Number(item.price) || 0;
      const itemTotal = parsedQuantity * parsedPrice;
      
      // Distribute points proportionally to item value
      const itemPoints = totalAmount > 0 ? (itemTotal / totalAmount) * totalPoints : 0;

      payloads.push({
        store_id,
        user_id,
        product_id: item.product_id,
        quantity: parsedQuantity,
        price: parsedPrice,
        transaction_type,
        reference_number: ref,
        points: Number(itemPoints.toFixed(2)),
      });
    }

    // Insert multiple transactions at once
    const { data, error } = await supabase
      .from('transactions')
      .insert(payloads)
      .select(`
        *,
        products!fk_transactions_product (product_name),
        users!fk_transactions_user (username),
        stores!fk_transactions_store (store_name)
      `);

    if (error) throw error;

    // Handle points updates per store
    if (user_id) {
      const { data: userPts } = await supabase
        .from('user_points')
        .select('id, user_id, total_points, redeemed_points, store_id')
        .eq('user_id', user_id)
        .eq('store_id', store_id)
        .maybeSingle();

      if (transaction_type === 'Purchase') {
        const newTotal = (userPts?.total_points || 0) + totalPoints;
        if (userPts) {
          await supabase
            .from('user_points')
            .update({ total_points: newTotal })
            .eq('user_id', user_id)
            .eq('store_id', store_id);
        } else {
          await supabase
            .from('user_points')
            .insert([{ user_id, store_id, total_points: totalPoints, redeemed_points: 0 }]);
        }
      } else if (transaction_type === 'Redemption') {
        const redeemCost = products.reduce((sum, item) => sum + item.quantity * item.price, 0);
        if (!userPts || userPts.total_points < redeemCost) {
          return res.status(400).json({ error: 'Not enough points to redeem at this store' });
        }
        await supabase
          .from('user_points')
          .update({
            total_points: userPts.total_points - redeemCost,
            redeemed_points: (userPts.redeemed_points || 0) + redeemCost,
          })
          .eq('user_id', user_id)
          .eq('store_id', store_id);
      }
    }

    return res.status(201).json({
      message: 'Transactions created successfully',
      reference_number: ref,
      data,
    });
  } catch (err) {
    console.error('Error creating transactions:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET all transactions (Admin view - shows all transactions from all stores)
 */
export const getTransactions = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id,
        reference_number,
        transaction_date,
        user_id,
        store_id,
        product_id,
        quantity,
        price,
        total,
        points,
        transaction_type,
        users!fk_transactions_user (username),
        stores!fk_transactions_store (store_name),
        products!fk_transactions_product (product_name, price)
      `)
      .order('transaction_date', { ascending: false });

    if (error) throw error;

    // ✅ Group by reference_number
    const grouped = Object.values(
      data.reduce((acc, txn) => {
        const ref = txn.reference_number;

        if (!acc[ref]) {
          acc[ref] = {
            reference_number: ref,
            transaction_date: txn.transaction_date,
            user: txn.users?.username || null,
            store: txn.stores?.store_name || null,
            transaction_type: txn.transaction_type,
            points: txn.points,
            items: [],
            total: 0,
          };
        }

        acc[ref].items.push({
          product_name: txn.products?.product_name,
          quantity: txn.quantity,
          price: txn.price ?? txn.products?.price ?? 0,
          subtotal: txn.total,
        });

        acc[ref].total += Number(txn.total);
        return acc;
      }, {})
    );

    return res.status(200).json(grouped);
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

    // Fetch the target transaction first (to get its reference number)
    const { data: singleTxn, error: fetchError } = await supabase
      .from('transactions')
      .select('reference_number')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!singleTxn) return res.status(404).json({ error: 'Transaction not found' });

    const referenceNumber = singleTxn.reference_number;
    // Fetch all rows with the same reference number
    const { data, error } = await supabase
    .from('transactions')
    .select(`
      id,
      reference_number,
      transaction_date,
      user_id,
      store_id,
      product_id,
      quantity,
      price,
      total,
      points,
      transaction_type,
      users!fk_transactions_user (username),
      stores!fk_transactions_store (store_name),
      products!fk_transactions_product (product_name)
    `)
    .eq('reference_number', referenceNumber)
    .order('transaction_date', { ascending: false });


    if (error) throw error;

    // Group (though for one ref, it’ll just produce one grouped object)
    const grouped = {
      reference_number: referenceNumber,
      transaction_date: data[0]?.transaction_date,
      user: data[0]?.users?.username || null,
      store: data[0]?.stores?.store_name || null,
      transaction_type: data[0]?.transaction_type,
      points: data[0]?.points,
      items: data.map(txn => ({
        product_name: txn.products?.product_name,
        quantity: txn.quantity,
        price: txn.price,
        subtotal: txn.total,
      })),
      total: data.reduce((sum, txn) => sum + Number(txn.total), 0),
    };

    return res.status(200).json(grouped);
  } catch (err) {
    console.error('Error fetching transaction by ID:', err);
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
        products!fk_transactions_product (product_name),
        users!fk_transactions_user (username),
        stores!fk_transactions_store (store_name)
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
