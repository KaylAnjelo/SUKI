import supabase from '../../config/db.js';

function generateReferenceNumber(dateString, storeId) {
  const datePart = new Date(dateString || Date.now())
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  const storePart = String(storeId || '')
    .toUpperCase()
    .slice(0, 6)
    .padEnd(6, 'X');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${storePart}-${datePart}-${random}`;
}

export const createTransaction = async (req, res) => {
  try {
    const {
      store_id,
      transaction_date,
      product_name,
      quantity,
      price,
    } = req.body || {};

    if (!store_id) return res.status(400).json({ error: 'store_id is required' });
    if (!product_name) return res.status(400).json({ error: 'product_name is required' });

    const parsedQuantity = Number(quantity) || 0;
    const parsedPrice = Number(price) || 0;
    const total = Number((parsedQuantity * parsedPrice).toFixed(2));

    // Always generate server-side reference number (ignore any client-provided value)
    const ref = generateReferenceNumber(transaction_date, store_id);

    const payload = {
      store_id,
      transaction_date: transaction_date || new Date().toISOString().slice(0, 10),
      product_name,
      quantity: parsedQuantity,
      price: parsedPrice,
      total,
      reference_number: ref,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error('Error creating transaction:', err);
    return res.status(500).json({ error: err.message });
  }
};


