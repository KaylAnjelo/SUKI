import express from 'express';
import { getOwnerProducts, upload, addProduct, deleteProduct, editProduct } from '../controllers/ownerProductsController.js';

const router = express.Router();

router.get('/', getOwnerProducts);
router.post('/add', upload.single('productImage'), addProduct);
router.post('/edit/:id', upload.single('productImage'), editProduct);
router.post('/delete/:id', deleteProduct);

export default router;
