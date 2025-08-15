import express from 'express';
import * as userTransactionsController from '../controllers/userTransactionsController.js';

const router = express.Router();

// Main route to display user transactions page
router.get('/', userTransactionsController.getUserTransactions);

// Route to filter transactions
router.post('/filter', userTransactionsController.filterUserTransactions);

// Route to get users for filter dropdown
router.get('/users', userTransactionsController.getUsersForFilter);

// Route to get stores for filter dropdown
router.get('/stores', userTransactionsController.getStoresForFilter);

export default router;
