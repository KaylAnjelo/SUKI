import express from 'express';
import * as notificationController from '../controllers/notificationController.js';

const router = express.Router();

router.get('AdminSide/notifications', notificationController.getNotifications);

export default router;
