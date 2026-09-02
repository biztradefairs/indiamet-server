// routes/floorPlanRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const BoothService = require('../services/FloorPlanService');

const ALLOWED_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = require('path').extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const allowed =
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      mime.includes('officedocument') ||
      mime.includes('msword') ||
      mime.includes('ms-excel') ||
      mime.includes('ms-powerpoint') ||
      ALLOWED_EXTS.has(ext) ||
      mime === 'application/octet-stream';
    if (allowed) {
      cb(null, true);
      return;
    }
    cb(new Error('Upload an image, PDF, or document (doc, xls, ppt).'));
  }
});

// ==============================
// GET FLOOR PLAN
// ==============================
const sendFloorPlan = async (req, res) => {
  try {
    const result = await BoothService.getFloorPlan();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(result);
  } catch (error) {
    console.error('❌ Get floor plan error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

router.get('/', sendFloorPlan);
router.get('/floor-plan', sendFloorPlan);

// ==============================
// UPLOAD FLOOR PLAN IMAGE - FIXED
// ==============================
router.post('/upload-image', authenticate, authorize(['admin', 'editor']), (req, res) => {
  const handler = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 }
  ]);

  handler(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        error: err.message || 'File upload error'
      });
    }

    try {
      const uploaded = req.file || req.files?.image?.[0] || req.files?.file?.[0];
      if (!uploaded) {
        return res.status(400).json({
          success: false,
          error: 'No file provided. Upload an image, PDF, or document.'
        });
      }

      const result = await BoothService.uploadFloorPlanImage(uploaded, req.user?.id || null);
      res.json(result);
    } catch (error) {
      console.error('❌ Upload image error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Upload failed'
      });
    }
  });
});

// ==============================
// RESET FLOOR PLAN
// ==============================
router.post('/reset', authenticate, authorize(['admin', 'editor']), async (req, res) => {
  try {
    const result = await BoothService.resetFloorPlan(req.user?.id || null);
    res.json(result);
  } catch (error) {
    console.error('❌ Reset error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================
// SAVE FLOOR PLAN
// ==============================
router.post('/save-floor-plan', async (req, res) => {
  try {
    const { booths } = req.body;
    const userId = req.user?.id || null;

    const result = await BoothService.saveFloorPlan(booths, userId);
    res.json(result);
  } catch (error) {
    console.error('❌ Save floor plan error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================
// ADD BOOTH
// ==============================
router.post('/booth', async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const result = await BoothService.addBooth(req.body, userId);
    res.json(result);
  } catch (error) {
    console.error('❌ Add booth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================
// UPDATE BOOTH
// ==============================
router.put('/booth/:boothId', async (req, res) => {
  try {
    const { boothId } = req.params;
    const userId = req.user?.id || null;
    const result = await BoothService.updateBooth(boothId, req.body, userId);
    res.json(result);
  } catch (error) {
    console.error('❌ Update booth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================
// DELETE BOOTH
// ==============================
router.delete('/booth/:boothId', async (req, res) => {
  try {
    const { boothId } = req.params;
    const userId = req.user?.id || null;
    const result = await BoothService.deleteBooth(boothId, userId);
    res.json(result);
  } catch (error) {
    console.error('❌ Delete booth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================
// GET STATISTICS
// ==============================
router.get('/statistics', async (req, res) => {
  try {
    const result = await BoothService.getBoothStatistics();
    res.json(result);
  } catch (error) {
    console.error('❌ Get statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;