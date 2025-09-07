import express from 'express';
import { createTransaction } from '../controllers/transactionsController.js';

const router = express.Router();

// POST /transactions
router.post('/', createTransaction);
router.post('/create', createTransaction);

export default router;


