import express from "express";
import {
  getOwnerDashboard,
  getSalesSummary,
  getTopProducts,
  getCustomerEngagement,
  getRecommendations,
} from "../controllers/ownerDashboardController.js";

const router = express.Router();

router.get("/", ( req, res )  => {
    res.render('OwnerSide/ownerDashboard', { user: req.session.user });
});

router.get("/sales-summary", getSalesSummary);
router.get("/top-products", getTopProducts);
router.get("/customer-engagement", getCustomerEngagement);
router.get("/recommendations", getRecommendations);

export default router;
