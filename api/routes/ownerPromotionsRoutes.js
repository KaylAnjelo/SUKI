import express from 'express';
import {
  createPromotion,
  getPromotions,
  getPromotionById,
  updatePromotion,
  deletePromotion
} from '../controllers/ownerPromotionsController.js';

const router = express.Router();

// Create a new promotion
router.post('/', createPromotion);

// Get all promotions for the owner's store
router.get('/', getPromotions);

// Get single promotion by ID
router.get('/:id', getPromotionById);

// Update promotion
router.put('/:id', updatePromotion);

// Delete promotion
router.delete('/:id', deletePromotion);

export default router;
