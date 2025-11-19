import express from 'express';
import {
  getOwnerStores,
  getStoreById,
  getOwnerTransactions,
  getOwnerTransactionById,
  createOwnerTransaction,
  updateOwnerTransaction,
  deleteOwnerTransaction
} from '../controllers/ownerTransactionController.js';

const router = express.Router();

// GET /api/owner/stores
router.get('/stores', getOwnerStores);
router.get('/stores/:id', getStoreById);

// GET /api/owner/transactions (all stores)
router.get('/transactions', getOwnerTransactions);

// GET /api/owner/transactions/:storeId (filtered by store)
router.get('/transactions/:storeId', getOwnerTransactions);

// POST /api/owner/transactions
router.post('/transactions', createOwnerTransaction);

// PUT /api/owner/transactions/:id
router.put('/transactions/:id', updateOwnerTransaction);

// DELETE /api/owner/transactions/:id
router.delete('/transactions/:id', deleteOwnerTransaction);

export default router;
