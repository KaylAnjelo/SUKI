import supabase from '../../config/db.js';

// helper: return numeric store ids owned by user
async function fetchOwnedStoreIds(ownerId) {
  const { data: stores, error } = await supabase
    .from('stores')
    .select('store_id')
    .eq('owner_id', ownerId);
  if (error) throw error;
  return (stores || []).map(s => Number(s.store_id)).filter(Boolean);
}

// Recompute and persist recommendations for the logged-in owner.
// Query params: period (e.g. "30d"), minCount (default 5), topPerProduct (default 5)
export async function computeAndStoreRecommendations(req, res) {
  try {
    const ownerId = req.session?.userId || req.session?.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { period = '30d', minCount = 5, topPerProduct = 5 } = req.query;
    const days = /^\d+d$/.test(period) ? parseInt(period.slice(0, -1), 10) : 30;
    const from = new Date(); from.setDate(from.getDate() - days);

    const storeIds = await fetchOwnedStoreIds(ownerId);
    if (!storeIds.length) return res.json({ updated: 0 });

    // fetch recent transactions (reference_number + product_id)
    const { data: txs, error: txErr } = await supabase
      .from('transactions')
      .select('reference_number, product_id')
      .in('store_id', storeIds)
      .gte('transaction_date', from.toISOString())
      .limit(50000);

    if (txErr) throw txErr;

    // group product ids by reference_number (transaction)
    const byRef = new Map();
    for (const t of (txs || [])) {
      const ref = t.reference_number || (`ref:${Math.floor(Math.random()*1e9)}`);
      if (!byRef.has(ref)) byRef.set(ref, new Set());
      byRef.get(ref).add(Number(t.product_id));
    }

    const allProductIds = Array.from(new Set([].concat(...Array.from(byRef.values()).map(s => Array.from(s)))));
    if (!allProductIds.length) return res.json({ updated: 0 });

    // fetch product types
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, product_type')
      .in('id', allProductIds);

    if (prodErr) throw prodErr;
    const typeMap = new Map((products || []).map(p => [Number(p.id), p.product_type || null]));

    // build co-occurrence counts only when product types differ
    const co = new Map(); // key "a::b" => count (order matters for recommendation direction)
    for (const set of byRef.values()) {
      const arr = Array.from(set);
      for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr.length; j++) {
          if (i === j) continue;
          const a = arr[i], b = arr[j];
          const ta = typeMap.get(a) ?? null;
          const tb = typeMap.get(b) ?? null;
          if (ta && tb && ta === tb) continue; // require different types
          const key = `${a}::${b}`;
          co.set(key, (co.get(key) || 0) + 1);
        }
      }
    }

    // collect candidates meeting minCount and topPerProduct
    const recMap = new Map(); // product_id => [{ id, score }]
    for (const [k, count] of co.entries()) {
      if (count < Number(minCount)) continue;
      const [aStr, bStr] = k.split('::');
      const a = Number(aStr), b = Number(bStr);
      if (!recMap.has(a)) recMap.set(a, []);
      recMap.get(a).push({ id: b, score: count });
    }

    for (const [pid, arr] of recMap.entries()) {
      arr.sort((x,y) => y.score - x.score);
      recMap.set(pid, arr.slice(0, Number(topPerProduct)));
    }

    // delete old owner rows for this period then insert computed ones
    const { error: delErr } = await supabase
      .from('owner_recommendations')
      .delete()
      .eq('owner_id', ownerId)
      .eq('periods_constraint', period);

    if (delErr) console.warn('delete existing recs err', delErr);

    const toInsert = [];
    for (const [pid, arr] of recMap.entries()) {
      for (const r of arr) {
        toInsert.push({
          owner_id: ownerId,
          product_id: pid,
          recommended_product_id: r.id,
          score: r.score,
          periods_constraint: period
        });
      }
    }

    if (toInsert.length) {
      const { error: insErr } = await supabase.from('owner_recommendations').insert(toInsert);
      if (insErr) throw insErr;
    }

    return res.json({ updated: toInsert.length });
  } catch (err) {
    console.error('computeAndStoreRecommendations error', err);
    return res.status(500).json({ error: 'Failed to compute recommendations' });
  }
}

// Fetch stored recommendations for owner (optional filter product_id)
export async function getStoredRecommendations(req, res) {
  try {
    const ownerId = req.session?.userId || req.session?.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { product_id } = req.query;
    let q = supabase.from('owner_recommendations').select('product_id, recommended_product_id, score').eq('owner_id', ownerId);
    if (product_id) q = q.eq('product_id', Number(product_id));
    const { data, error } = await q.order('score', { ascending: false }).limit(200);
    if (error) throw error;

    const ids = Array.from(new Set([].concat((data || []).map(d => d.product_id), (data || []).map(d => d.recommended_product_id))));
    let prodMap = new Map();
    if (ids.length) {
      const { data: prodRows } = await supabase.from('products').select('id, product_name').in('id', ids);
      prodMap = new Map((prodRows || []).map(p => [Number(p.id), p.product_name]));
    }

    const formatted = (data || []).map(r => ({
      product_id: r.product_id,
      product_name: prodMap.get(Number(r.product_id)) ?? null,
      recommended_product_id: r.recommended_product_id,
      recommended_product_name: prodMap.get(Number(r.recommended_product_id)) ?? null,
      score: r.score
    }));

    return res.json({ recommendations: formatted });
  } catch (err) {
    console.error('getStoredRecommendations error', err);
    return res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
}

export default { computeAndStoreRecommendations, getStoredRecommendations };
