import express from "express";
import {
  getOwnerProducts,
  addProduct,
  deleteProduct,
  upload,
} from "../controllers/ownerProductsController.js";

const router = express.Router();

router.get("/", getOwnerProducts);
router.post("/add", upload.single("product_image"), addProduct);
router.post("/delete/:id", deleteProduct);

export default router;
