import express from 'express';
import {
  getOwnerStores,
  getOwnerTransactions,
  getOwnerTransactionById,
  createOwnerTransaction,
  updateOwnerTransaction,
  deleteOwnerTransaction
} from '../controllers/ownerTransactionController.js';

const router = express.Router();

// GET /api/owner/stores
router.get('/stores', getOwnerStores);

// GET /api/owner/transactions
router.get('/transactions', getOwnerTransactions);

// GET /api/owner/transactions/:id
router.get('/transactions/:id', getOwnerTransactionById);

// POST /api/owner/transactions
router.post('/transactions', createOwnerTransaction);

// PUT /api/owner/transactions/:id
router.put('/transactions/:id', updateOwnerTransaction);

// DELETE /api/owner/transactions/:id
router.delete('/transactions/:id', deleteOwnerTransaction);

export default router;
