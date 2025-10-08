import express from 'express';
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction
} from '../controllers/transactionsController.js';

const router = express.Router();

// --- Transaction Endpoints ---
router.get('/', getTransactions);            // GET all
router.get('/:id', getTransactionById);      // GET by ID
router.post('/', createTransaction);         // CREATE (Purchase / Redemption / Refund)
router.put('/:id', updateTransaction);       // UPDATE
router.delete('/:id', deleteTransaction);    // DELETE

export default router;
