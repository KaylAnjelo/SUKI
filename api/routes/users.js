import express from 'express';

const router = express.Router();

router.get('/Redemptions', (req, res) => {
    res.render('users/Redemptions');
});

router.get('/UserManagement', (req, res) => {
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

export default router;