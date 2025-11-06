// helpers/getOwnedStoreIdsOrFail.js
import supabase from '../../config/db.js';

export async function getOwnedStoreIdsOrFail(userId, res) {
  const { data: ownerStores, error: storesErr } = await supabase
    .from('stores')
    .select('store_id')
    .eq('owner_id', userId);

  if (storesErr) {
    console.error('Error fetching owner stores', storesErr);
    res.status(500).json({ error: 'Failed to fetch owner stores' });
    return null;
  }

  const ownedStoreIds = (ownerStores || [])
    .map(s => Number(s.store_id)) // convert to number
    .filter(Boolean);
  console.log("✅ getOwnedStoreIdsOrFail:", ownedStoreIds);
  return ownedStoreIds;
}
