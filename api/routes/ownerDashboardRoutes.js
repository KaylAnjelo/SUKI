import express from 'express';
import {
  getOwnerDashboard,
  getSalesSummary,
  getCustomerEngagement,
  getTopProducts
} from '../controllers/ownerDashboardController.js';
import recController from '../controllers/recommendationController.js';
import kmeansRec from '../controllers/recommendationKMeansController.js';

const router = express.Router();

router.get('/', getOwnerDashboard);

// existing API endpoints
router.get('/sales-summary', getSalesSummary);
router.get('/customer-engagement', getCustomerEngagement);
router.get('/top-products', getTopProducts);

// recommendations: fetch stored results
router.get('/recommendations', recController.getStoredRecommendations.bind(recController));
// trigger recompute (GET or POST) - requires authenticated owner
router.post('/recompute-recommendations', recController.computeAndStoreRecommendations.bind(recController));
router.get('/recompute-recommendations', recController.computeAndStoreRecommendations.bind(recController));

// k-means recommendations
router.post('/recompute-kmeans', kmeansRec.computeKMeansRecommendations.bind(kmeansRec));
router.get('/recompute-kmeans', kmeansRec.computeKMeansRecommendations.bind(kmeansRec));

export default router;
