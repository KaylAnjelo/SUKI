import express from 'express';
import multer from 'multer';
import * as UserManagementController from "../controllers/UserManagementController.js";

const upload = multer();
const router = express.Router();

router.get('/Redemptions', (req, res) => {
    res.render('users/Redemptions');
});

// User Management (support common aliases)
router.get(['/UserManagement', '/usermanagement', '/user-management', '/management'], (req, res) => {
    res.render('users/UserManagement');
});

// Customers (fetch + render table)
router.get('/customers', UserManagementController.getCustomers);

router.get('/stores', UserManagementController.getStores);
// Add the missing route for /users/Store
router.get('/Store', UserManagementController.getStores);
router.get('/test-connection', UserManagementController.testConnection);
router.post('/stores/add', upload.single('storeImage'), UserManagementController.addStore);
router.post('/stores/delete/:id', UserManagementController.deleteStore);


router.get('/Vendor', (req, res) => {
    res.render('users/Vendor');
});

router.get('/UserManagement/AddUser', (req, res) => {
    res.render('users/AddUser');
});

export default router;
