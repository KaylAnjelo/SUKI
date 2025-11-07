import express from "express";
import { getOwnerProducts } from "../controllers/ownerProductsController.js";

const router = express.Router();

router.get("/", getOwnerProducts);

export default router;
