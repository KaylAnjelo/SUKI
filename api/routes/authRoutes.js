import express from 'express';
import * as loginController from '../controllers/loginController.js';

const router = express.Router();

// Authentication routes
router.get('/', (req, res) => res.render('index'));
router.post('/login', loginController.login);
router.post('/logout', loginController.logout);

export default router;