
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const DOCUMENT_UPLOAD_DIR = path.join(
  process.cwd(),
  "storage",
  "private",
  "employee-documents"
);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

// Create private directory if it does not exist.
fs.mkdirSync(DOCUMENT_UPLOAD_DIR, {
  recursive: true,
  mode: 0o700,
});

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, DOCUMENT_UPLOAD_DIR);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const uniqueFilename =
      `document-${Date.now()}-${require("crypto").randomUUID()}${extension}`;

    callback(null, uniqueFilename);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (
      !ALLOWED_MIME_TYPES.includes(file.mimetype) ||
      !ALLOWED_EXTENSIONS.includes(extension)
    ) {
      const error = new Error(
        "Only PDF, JPG, JPEG and PNG documents are allowed"
      );

      error.code = "INVALID_DOCUMENT_TYPE";

      return callback(error);
    }

    callback(null, true);
  },
});

function uploadEmployeeDocument(req, res, next) {
  upload.single("document")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: error.code,
          message: "Document must not exceed 5 MB",
        });
      }

      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "INVALID_DOCUMENT_TYPE") {
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
  uploadEmployeeDocument,
  DOCUMENT_UPLOAD_DIR,
};
