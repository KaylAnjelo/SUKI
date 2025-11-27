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
router.post('/stores/add-to-owner', upload.single('storeImage'), UserManagementController.addStoreToExistingOwner);
router.post('/stores/delete/:id', UserManagementController.deleteStore);
// Accept multipart/form-data for updates (optional image upload)
router.post('/stores/update', upload.single('storeImage'), UserManagementController.updateStore);


router.get('/vendor', UserManagementController.getVendors);

// Create a new vendor via admin
router.post('/vendor', UserManagementController.addVendor);

router.get('/UserManagement/AddUser', (req, res) => {
    res.render('users/AddUser');
});

// Create a new user (customer) via admin
router.post('/', UserManagementController.addCustomer);

// Update a user by username (PUT) and delete a user by username (DELETE)
router.put('/:username', UserManagementController.updateUser);
router.delete('/:username', UserManagementController.deleteUser);
// delete by user_id to avoid special-character issues in usernames
router.delete('/id/:id', UserManagementController.deleteUser);
// body-based update (avoids special-char issues in URL)
router.put('/update', UserManagementController.updateUser);

export default router;
