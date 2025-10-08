import express from 'express';
import {
  createOwnerTransaction,
  getOwnerTransactions,
  getOwnerTransactionById,
  updateOwnerTransaction,
  deleteOwnerTransaction
} from '../controllers/ownerTransactionController.js';

const router = express.Router();

// --- Owner Transaction Endpoints ---
router.get('/', getOwnerTransactions);            // GET all transactions for owner's stores
router.get('/:id', getOwnerTransactionById);      // GET by ID (owner's stores only)
router.post('/', createOwnerTransaction);         // CREATE (Purchase / Redemption / Refund)
router.put('/:id', updateOwnerTransaction);       // UPDATE (owner's stores only)
router.delete('/:id', deleteOwnerTransaction);    // DELETE (owner's stores only)

export default router;
