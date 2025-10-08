import express from 'express';
import {
  getOwnerStores,
  getOwnerStoreById,
  createOwnerStore,
  updateOwnerStore,
  deleteOwnerStore,
  upload
} from '../controllers/ownerStoresController.js';

const router = express.Router();

// Owner Stores CRUD routes
router.get('/', getOwnerStores);                    // GET all stores for owner
router.get('/:id', getOwnerStoreById);              // GET store by ID
router.post('/', upload.single('storeImage'), createOwnerStore);  // CREATE store
router.put('/:id', upload.single('storeImage'), updateOwnerStore); // UPDATE store
router.delete('/:id', deleteOwnerStore);            // DELETE store

export default router;

