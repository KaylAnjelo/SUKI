import express from 'express';

const router = express.Router();

router.get('/Redemptions', (req, res) => {
    res.render('users/Redemptions');
});

router.get('/UserManagement', (req, res) => {
    res.render('users/UserManagement');
});

export default router;