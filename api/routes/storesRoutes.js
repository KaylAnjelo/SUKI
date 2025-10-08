import express from "express";
import supabase from "../../config/db.js";

const router = express.Router();

router.get("/", async (req , res) => {
    const {data, error} = await supabase.from("stores").select("*");

    if (error) {
        return res.status(500).json({ error: error.message});
    }

    res.json(data);
})

export default router;