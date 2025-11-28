import express from 'express';
import { getOwnerProducts, getProductById, upload, addProduct, editProduct, deleteProduct, getOwnerProductsJson } from '../controllers/ownerProductsController.js';

const router = express.Router();

router.get('/', getOwnerProducts);
router.get('/all', getOwnerProductsJson);
router.get('/get/:id', getProductById);
router.post('/add', upload.single('productImage'), addProduct);
router.post('/edit/:id', upload.single('productImage'), editProduct);
router.post('/delete/:id', deleteProduct);
router.delete('/delete/:id', deleteProduct);

export default router;
