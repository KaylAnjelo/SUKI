import express from 'express';

const router = express.Router();

router.get('/Redemptions', (req, res) => {
    res.render('users/Redemptions');
});

// User Management (support common aliases)
router.get(['/UserManagement', '/usermanagement', '/user-management', '/management'], (req, res) => {
    res.render('users/UserManagement');
});

router.get('/Customer', (req, res) => {
    res.render('users/Customer');
});

router.get('/Store', (req, res) => {
    res.render('users/Store');
});

router.get('/Vendor', (req, res) => {
    res.render('users/Vendor');
});

router.get('/UserManagement/AddUser', (req, res) => {
    res.render('users/AddUser');
});

export default router;