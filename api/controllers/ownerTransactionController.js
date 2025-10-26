// controllers/ownerTransactionController.js
import supabase from '../../config/db.js';
import { calculatePoints } from '../utils/points.js';
import { generateReferenceNumber } from '../utils/reference.js';

/**
 * GET transactions for owner's stores only
 */
export const getOwnerTransactions = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.user_id || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const storeIdParam = req.params.storeId;
    const storeId = storeIdParam ? parseInt(storeIdParam, 10) : null;
    if (storeIdParam && Number.isNaN(storeId)) {
      return res.status(400).json({ error: 'Invalid store id' });
    }

    const { data: ownedStores } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    const ownedStoreIds = (ownedStores || []).map(s => s.store_id);
    if (ownedStoreIds.length === 0) return res.json([]);

    const targetStoreIds = storeId ? ownedStoreIds.filter(id => id === storeId) : ownedStoreIds;

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id,
        reference_number,
        store_id,
        transaction_date,
        transaction_type,
        price,
        quantity,
        points,
        users:user_id ( username ),
        products:product_id ( product_name ),
        stores:store_id ( store_name )
      `)
      .in('store_id', targetStoreIds)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      return res.status(500).json({ error: error.message || 'DB error' });
    }

    const groups = {};
    (data || []).forEach(tx => {
      const ref = tx.reference_number || `ref_${tx.id}`;
      if (!groups[ref]) {
        groups[ref] = {
          reference_number: ref,
          store_id: tx.store_id,
          store_name: tx.stores?.store_name || 'N/A', // <- add store_name here
          transaction_date: tx.transaction_date,
          total_amount: 0,
          total_points: 0,
          items: []
        };
      }
      const amount = (Number(tx.price) || 0) * (Number(tx.quantity) || 0);
      groups[ref].total_amount += amount;
      groups[ref].total_points += Number(tx.points) || 0;
      groups[ref].items.push({
        id: tx.id,
        transaction_id: tx.id,
        product_name: tx.products?.product_name || null,
        quantity: tx.quantity,
        price: tx.price,
        amount,
        username: tx.users?.username || null,
        transaction_date: tx.transaction_date,
        transaction_type: tx.transaction_type,
        store_name: tx.stores?.store_name || null // include store_name on item too
      });
    });

    return res.json(Object.values(groups));
  } catch (err) {
    console.error('Unexpected error getOwnerTransactionsApi:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

/**
 * GET transaction by ID (owner's stores only)
 */
export const getOwnerTransactionById = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.user_id || req.session?.user?.id;
    const id = parseInt(req.params.id, 10);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid transaction id' });

    const { data: userStores, error: storesError } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storesError) {
      console.error('Error fetching user stores:', storesError);
      return res.status(500).json({ error: 'Failed to fetch user stores' });
    }

    const storeIds = (userStores || []).map(store => store.store_id);

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        products (product_name),
        users (username),
        stores (store_name)
      `)
      .eq('id', id)           // use id column
      .in('store_id', storeIds)
      .maybeSingle();

    if (error) {
      console.error('Error fetching transaction by id:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Transaction not found or access denied' });

    return res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching owner transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * CREATE Transaction for owner's stores (handles Purchase, Redemption, Refund)
 */
export const createOwnerTransaction = async (req, res) => {
  try {
    const userId = req.session.userId;
    const {
      store_id,
      user_id,
      product_id,
      quantity,
      price,
      transaction_type = 'Purchase',
    } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!store_id) return res.status(400).json({ error: 'store_id is required' });
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });

    // Verify that the store belongs to the owner
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('store_id', store_id)
      .eq('owner_id', userId)
      .single();

    if (storeError || !store) {
      return res.status(403).json({ error: 'Store not found or access denied' });
    }

    const parsedQuantity = Number(quantity) || 0;
    const parsedPrice = Number(price) || 0;

    if (parsedQuantity <= 0) {
      return res.status(400).json({ error: 'quantity must be greater than 0' });
    }

    const storeName = store.store_name || '';
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
    console.error('Error creating owner transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * UPDATE transaction (owner's stores only)
 */
export const updateOwnerTransaction = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    const payload = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // First get all stores owned by the user
    const { data: userStores, error: storesError } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storesError) {
      console.error('Error fetching user stores:', storesError);
      return res.status(500).json({ error: 'Failed to fetch user stores' });
    }

    const storeIds = (userStores || []).map(store => store.store_id);

    // Verify transaction belongs to owner's store
    const { data: existingTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('store_id')
      .eq('id', id)
      .in('store_id', storeIds)
      .single();

    if (fetchError || !existingTransaction) {
      return res.status(404).json({ error: 'Transaction not found or access denied' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', id)
      .in('store_id', storeIds)
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
    console.error('Error updating owner transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE transaction (owner's stores only)
 */
export const deleteOwnerTransaction = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // First get all stores owned by the user
    const { data: userStores, error: storesError } = await supabase
      .from('stores')
      .select('store_id')
      .eq('owner_id', userId);

    if (storesError) {
      console.error('Error fetching user stores:', storesError);
      return res.status(500).json({ error: 'Failed to fetch user stores' });
    }

    const storeIds = (userStores || []).map(store => store.store_id);

    // Verify transaction belongs to owner's store
    const { data: existingTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('store_id')
      .eq('id', id)
      .in('store_id', storeIds)
      .single();

    if (fetchError || !existingTransaction) {
      return res.status(404).json({ error: 'Transaction not found or access denied' });
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .in('store_id', storeIds);

    if (error) throw error;
    return res.status(204).send(); // No content
  } catch (err) {
    console.error('Error deleting owner transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET owner's stores
 */
export const getOwnerStores = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.user_id || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: stores, error } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('owner_id', userId)
      .order('store_id', { ascending: true });

    if (error) {
      console.error('Error fetching stores:', error);
      return res.status(500).json({ error: error.message || 'DB error' });
    }

    return res.json(stores);
  } catch (err) {
    console.error('Unexpected error getOwnerStoresApi:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
