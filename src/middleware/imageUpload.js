const multer = require('multer');
const path = require('path');

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-ms-bmp',
  'image/heic',
  'image/heif'
]);

const ALLOWED_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.jfif',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.heic',
  '.heif'
]);

function isAllowedImage(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase().trim();

  if (ALLOWED_MIMES.has(mime)) return true;

  // Windows / some browsers send empty MIME or application/octet-stream
  const mimeMissing = !mime || mime === 'application/octet-stream';
  if (ALLOWED_EXTS.has(ext) && (mimeMissing || mime.startsWith('image/'))) {
    return true;
  }

  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (isAllowedImage(file)) {
      cb(null, true);
      return;
    }

    console.warn('Rejected image upload:', {
      mimetype: file.mimetype,
      originalname: file.originalname
    });
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
  }
});

function singleImage(field = 'image') {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (!err) return next();

      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image is too large. Maximum size is 5MB.'
          : err.message || 'Invalid image file.';

      return res.status(400).json({
        success: false,
        error: message,
        message
      });
    });
  };
}

module.exports = { singleImage, upload, isAllowedImage };
