import multer from "multer";

// Store uploaded files temporarily in memory (for Supabase upload)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only image files are allowed (jpg, jpeg, png, webp)"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // limit 2MB
});

export default upload;
