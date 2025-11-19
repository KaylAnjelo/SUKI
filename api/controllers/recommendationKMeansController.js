import supabase from '../../config/db.js';

// Helper: return numeric store ids owned by user
async function fetchOwnedStoreIds(ownerId) {
  const { data: stores, error } = await supabase
    .from('stores')
    .select('store_id')
    .eq('owner_id', ownerId);

  if (error) throw error;
  return (stores || []).map(s => Number(s.store_id)).filter(Boolean);
}

// Simple k-means implementation (Euclidean)
function kmeans(vectors, k = 5, maxIter = 50) {
  if (!vectors.length) return { labels: [], centroids: [] };
  const dim = vectors[0].length;
  // init centroids by sampling k distinct vectors (or duplicates if fewer)
  const centroids = [];
  const used = new Set();
  for (let i = 0; i < k; i++) {
    let idx = Math.floor(Math.random() * vectors.length);
    // avoid duplicate seed if possible
    let tries = 0;
    while (used.has(idx) && tries++ < 10) idx = Math.floor(Math.random() * vectors.length);
    used.add(idx);
    centroids.push(vectors[idx].slice());
  }

  const labels = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let moved = 0;
    // assignment
    for (let i = 0; i < vectors.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        let d = 0;
        for (let j = 0; j < dim; j++) {
          const diff = vectors[i][j] - centroids[c][j];
          d += diff * diff;
        }
        if (d < bestDist) { bestDist = d; best = c; }
      }
      if (labels[i] !== best) { moved++; labels[i] = best; }
    }
    // update centroids
    const sums = Array.from({ length: centroids.length }, () => new Array(dim).fill(0));
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < vectors.length; i++) {
      const c = labels[i];
      counts[c]++;
      for (let j = 0; j < dim; j++) sums[c][j] += vectors[i][j];
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] === 0) {
        // re-seed empty centroid
        centroids[c] = vectors[Math.floor(Math.random() * vectors.length)].slice();
      } else {
        for (let j = 0; j < dim; j++) centroids[c][j] = sums[c][j] / counts[c];
      }
    }
    if (moved === 0) break;
  }

  return { labels, centroids };
}

/*
  Core worker: compute KMeans recommendations for a specific ownerId.
  options: { period, topFeatures, k, minCount, topPerProduct }
  Returns { updated, clusters } or throws on error.
*/
export async function computeKMeansForOwner(ownerId, options = {}) {
  const { period = '30d', topFeatures = 100, k = 8, minCount = 5, topPerProduct = 5 } = options;
  const days = /^\d+d$/.test(period) ? parseInt(period.slice(0, -1), 10) : 30;
  const from = new Date(); from.setDate(from.getDate() - days);

  const storeIds = await fetchOwnedStoreIds(ownerId);
  if (!storeIds.length) return { updated: 0, reason: 'no stores' };

  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('reference_number, product_id')
    .in('store_id', storeIds)
    .gte('transaction_date', from.toISOString())
    .limit(100000);
  if (txErr) throw txErr;

  // replace the previous grouping loop with this deterministic grouping:

  // group product ids by a stable order key
  const byRef = new Map();
  const WINDOW_MS = 1000 * 60 * 5; // 5 minute grouping window for synthetic refs

  for (const t of (txs || [])) {
    // prefer explicit order/ref fields that your API might provide
    const explicitRef = t.reference_number ?? t.order_id ?? t.receipt_id ?? null;

    let refKey;
    if (explicitRef) {
      refKey = String(explicitRef);
    } else {
      // fallback: bucket by user + store + time window so items posted together group
      const ts = new Date(t.transaction_date || t.created_at || Date.now()).getTime();
      const bucket = Math.floor(ts / WINDOW_MS);
      const userPart = t.user_id ?? t.customer_id ?? 'anon';
      const storePart = t.store_id ?? 'store';
      refKey = `synth:${storePart}:${userPart}:${bucket}`;
    }

    if (!byRef.has(refKey)) byRef.set(refKey, new Set());
    byRef.get(refKey).add(Number(t.product_id));
  }

  const freq = new Map();
  for (const set of byRef.values()) for (const pid of set) freq.set(pid, (freq.get(pid) || 0) + 1);
  if (!freq.size) return { updated: 0, reason: 'no transactions' };

  const featureIds = Array.from(freq.entries())
    .sort((a,b) => b[1] - a[1])
    .slice(0, Number(topFeatures))
    .map(x => x[0]);

  const allProductIds = Array.from(new Set([].concat(...Array.from(byRef.values()).map(s => Array.from(s)))));
  const featIndex = new Map(featureIds.map((id, idx) => [id, idx]));
  const prodIndex = new Map();
  for (let i = 0; i < allProductIds.length; i++) prodIndex.set(allProductIds[i], i);

  const vectors = [];
  for (let i = 0; i < allProductIds.length; i++) vectors.push(new Array(featureIds.length).fill(0));

  for (const basket of byRef.values()) {
    const presentFeaturePositions = [];
    for (const f of featureIds) if (basket.has(f)) presentFeaturePositions.push(featIndex.get(f));
    if (!presentFeaturePositions.length) continue;
    for (const pid of basket) {
      const idx = prodIndex.get(pid);
      if (idx === undefined) continue;
      for (const pos of presentFeaturePositions) vectors[idx][pos] += 1;
    }
  }

  const anyNonZero = vectors.some(v => v.some(x => x !== 0));
  if (!anyNonZero) return { updated: 0, reason: 'no signal' };

  const kk = Math.min(Number(k), Math.max(1, Math.floor(allProductIds.length / 2)));
  const { labels } = kmeans(vectors, kk, 80);

  const pairCounts = new Map();
  for (const basket of byRef.values()) {
    const arr = Array.from(basket);
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const a = arr[i], b = arr[j];
        const aIdx = prodIndex.get(a), bIdx = prodIndex.get(b);
        if (aIdx === undefined || bIdx === undefined) continue;
        if (labels[aIdx] !== labels[bIdx]) continue;
        const key = `${a}::${b}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  const recMap = new Map();
  for (const [kpair, cnt] of pairCounts.entries()) {
    if (cnt < Number(minCount)) continue;
    const [aStr, bStr] = kpair.split('::');
    const a = Number(aStr), b = Number(bStr);
    if (!recMap.has(a)) recMap.set(a, []);
    recMap.get(a).push({ id: b, score: cnt });
  }

  for (const [pid, arr] of recMap.entries()) {
    arr.sort((x,y) => y.score - x.score);
    recMap.set(pid, arr.slice(0, Number(topPerProduct)));
  }

  const { error: delErr } = await supabase
    .from('owner_recommendations')
    .delete()
    .eq('owner_id', ownerId)
    .eq('periods_constraint', period);
  if (delErr) console.warn('delete existing recs err', delErr);

  const toInsert = [];
  for (const [pid, arr] of recMap.entries()) for (const r of arr) {
    toInsert.push({
      owner_id: ownerId,
      product_id: pid,
      recommended_product_id: r.id,
      score: r.score,
      periods_constraint: period
    });
  }

  if (toInsert.length) {
    const { error: insErr } = await supabase.from('owner_recommendations').insert(toInsert);
    if (insErr) throw insErr;
  }

  return { updated: toInsert.length, clusters: new Set(labels).size };
}

/*
  POST /api/owner/dashboard/recompute-kmeans
  Query params:
    period (e.g. 30d) default 30d
    topFeatures (number of co-occurrence features to use) default 100
    k (clusters) default 8
    minCount (min co-occurrence threshold) default 5
    topPerProduct (max recommendations per product) default 5
*/
export async function computeKMeansRecommendations(req, res) {
  try {
    const ownerId = req.session?.userId || req.session?.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await computeKMeansForOwner(ownerId, req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('computeKMeansRecommendations error', err);
    return res.status(500).json({ error: 'Failed to compute k-means recommendations' });
  }
}

export default { computeKMeansForOwner, computeKMeansRecommendations };
