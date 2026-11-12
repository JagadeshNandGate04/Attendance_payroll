
const multer = require("multer");

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const error = new Error(
        "Only JPG, JPEG, PNG and WebP images are allowed"
      );

      error.code = "INVALID_IMAGE_TYPE";

      return callback(error);
    }

    callback(null, true);
  },
});

function uploadProfilePicture(req, res, next) {
  upload.single("profile_picture")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: error.code,
          message: "Profile picture must not exceed 2 MB",
        });
      }

      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "INVALID_IMAGE_TYPE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return next(error);
  });
}

module.exports = {
  uploadProfilePicture,
};
