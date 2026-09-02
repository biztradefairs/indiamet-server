// services/BoothService.js
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const cloudinaryService = require('./CloudinaryService');

function classifyFile(file = {}) {
  const mime = String(file.mimetype || '').toLowerCase();
  const name = String(file.originalname || file.filename || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/.test(name)) {
    return 'image';
  }
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }
  return 'document';
}

function publicFileUrl(relativePath) {
  const base = (process.env.BACKEND_URL || process.env.PUBLIC_SITE_URL || 'http://localhost:5000').replace(/\/$/, '');
  return `${base}${relativePath}`;
}

function floorPlanUploadDir() {
  return path.join(process.cwd(), 'uploads', 'floor-plans');
}

function latestLocalFloorPlanUrl() {
  const dir = floorPlanUploadDir();
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .map((name) => ({
      name,
      time: fs.statSync(path.join(dir, name)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);
  if (!files[0]) return null;
  return publicFileUrl(`/uploads/floor-plans/${files[0].name}`);
}

function isPrivateCloudinaryUrl(url) {
  return /res\.cloudinary\.com\/.+\/raw\//i.test(String(url || ''));
}

class BoothService {
  constructor() {
    this._floorPlanModel = null;
  }

  get FloorPlan() {
    if (!this._floorPlanModel) {
      const modelFactory = require('../models');
      this._floorPlanModel = modelFactory.getModel('FloorPlan');
    }
    return this._floorPlanModel;
  }

  get sequelize() {
    return require('../config/database').getConnection('mysql');
  }

  async ensureTable() {
    const sequelize = this.sequelize;
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS floor_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT 'Exhibition Floor Plan',
        base_image_url TEXT,
        file_type VARCHAR(50),
        original_file_name VARCHAR(255),
        cloudinary_public_id VARCHAR(255),
        booths TEXT DEFAULT '[]',
        image_width INTEGER,
        image_height INTEGER,
        reference_points TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        is_master BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(255),
        updated_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const extraColumns = [
      'ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS base_image_url TEXT',
      'ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)',
      'ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS original_file_name VARCHAR(255)',
      'ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(255)',
      'ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS booths TEXT',
      'ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS image_width INTEGER',
      'ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS image_height INTEGER',
      'ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE'
    ];
    for (const sql of extraColumns) {
      try {
        await sequelize.query(sql);
      } catch (error) {
        console.warn('floor_plans alter skipped:', error.message);
      }
    }

    try {
      await sequelize.query('CREATE SEQUENCE IF NOT EXISTS floor_plans_id_seq');
      await sequelize.query("ALTER TABLE floor_plans ALTER COLUMN id SET DEFAULT nextval('floor_plans_id_seq')");
      await sequelize.query(`
        DO $$
        DECLARE
          max_id integer;
        BEGIN
          SELECT MAX(id) INTO max_id FROM floor_plans;
          IF max_id IS NULL THEN
            PERFORM setval('floor_plans_id_seq', 1, false);
          ELSE
            PERFORM setval('floor_plans_id_seq', max_id, true);
          END IF;
        END $$;
      `);
    } catch (error) {
      console.warn('floor_plans id sequence skipped:', error.message);
    }

    const typeFixes = [
      'ALTER TABLE floor_plans ALTER COLUMN created_by TYPE VARCHAR(255) USING created_by::text',
      'ALTER TABLE floor_plans ALTER COLUMN updated_by TYPE VARCHAR(255) USING updated_by::text'
    ];
    for (const sql of typeFixes) {
      try {
        await sequelize.query(sql);
      } catch (error) {
        console.warn('floor_plans type alter skipped:', error.message);
      }
    }
  }

  formatPlan(row) {
    const json = row?.toJSON ? row.toJSON() : (row || {});
    let fileUrl = json.baseImageUrl || json.base_image_url || json.imageUrl || json.image || null;
    if (!fileUrl || isPrivateCloudinaryUrl(fileUrl)) {
      fileUrl = latestLocalFloorPlanUrl() || (isPrivateCloudinaryUrl(fileUrl) ? null : fileUrl);
    }
    let booths = json.booths || [];
    if (typeof booths === 'string') {
      try {
        booths = JSON.parse(booths);
      } catch {
        booths = [];
      }
    }
    return {
      success: true,
      data: {
        id: json.id,
        name: json.name,
        baseImageUrl: fileUrl,
        fileType: fileUrl
          ? (json.fileType || json.file_type || classifyFile({ originalname: json.originalFileName || json.original_file_name || fileUrl || '' }))
          : null,
        originalFileName: json.originalFileName || json.original_file_name || null,
        imageWidth: json.imageWidth || json.image_width || null,
        imageHeight: json.imageHeight || json.image_height || null,
        booths: Array.isArray(booths) ? booths : []
      }
    };
  }

  async persistPlanRecord(payload, userId) {
    try {
      let floorPlan = await this.FloorPlan.findOne({
        where: { isActive: true },
        order: [['createdAt', 'DESC']]
      });

      if (!floorPlan) {
        floorPlan = await this.FloorPlan.create({
          ...payload,
          booths: [],
          createdBy: userId || null,
          isActive: true
        });
      } else {
        await floorPlan.update(payload);
      }
      return floorPlan;
    } catch (modelError) {
      console.warn('Floor plan model persist failed, using SQL:', modelError.message);
      const sequelize = this.sequelize;
      const [existing] = await sequelize.query(
        'SELECT id FROM floor_plans ORDER BY id DESC LIMIT 1'
      );

      const replacements = {
        name: payload.name || 'Main Exhibition Floor',
        url: payload.baseImageUrl,
        fileType: payload.fileType || null,
        fileName: payload.originalFileName || null,
        publicId: payload.cloudinaryPublicId || null,
        imageWidth: payload.imageWidth || null,
        imageHeight: payload.imageHeight || null,
        userId: userId || null
      };

      if (existing[0]?.id) {
        await sequelize.query(
          `UPDATE floor_plans SET
            name = :name,
            base_image_url = :url,
            file_type = :fileType,
            original_file_name = :fileName,
            cloudinary_public_id = :publicId,
            image_width = :imageWidth,
            image_height = :imageHeight,
            is_active = TRUE,
            updated_by = :userId,
            updated_at = NOW()
           WHERE id = :id`,
          { replacements: { ...replacements, id: existing[0].id } }
        );
        return { id: existing[0].id, ...payload };
      }

      const [inserted] = await sequelize.query(
        `INSERT INTO floor_plans (
            name, base_image_url, file_type, original_file_name, cloudinary_public_id,
            booths, image_width, image_height, is_active, created_by, updated_by, created_at, updated_at
          ) VALUES (
            :name, :url, :fileType, :fileName, :publicId,
            '[]', :imageWidth, :imageHeight, TRUE, :userId, :userId, NOW(), NOW()
          ) RETURNING id`,
        { replacements }
      );
      return { id: inserted[0]?.id, ...payload };
    }
  }

async uploadFloorPlanImage(imageFile, userId) {
  try {
    console.log('📤 Uploading floor plan file...');
    
    // Debug the incoming file
    console.log('Image file details:', {
      hasBuffer: !!imageFile?.buffer,
      hasOriginalname: !!imageFile?.originalname,
      mimetype: imageFile?.mimetype,
      size: imageFile?.size,
      constructor: imageFile?.constructor?.name,
      keys: imageFile ? Object.keys(imageFile) : []
    });

    // Handle different possible input formats
    let buffer;
    let filename = imageFile?.originalname || 'floor-plan.bin';

    if (Buffer.isBuffer(imageFile)) {
      // If it's already a buffer
      buffer = imageFile;
    } else if (imageFile && imageFile.buffer) {
      // If it's a Multer file with buffer property
      buffer = imageFile.buffer;
      filename = imageFile.originalname || filename;
    } else if (imageFile && imageFile.data) {
      // If it's a file with data property
      buffer = Buffer.isBuffer(imageFile.data) 
        ? imageFile.data 
        : Buffer.from(imageFile.data);
      filename = imageFile.name || filename;
    } else {
      throw new Error('Unsupported file format. Expected a file with buffer property.');
    }

    // Validate buffer
    if (!buffer || buffer.length === 0) {
      throw new Error('Invalid file buffer - buffer is empty');
    }

    console.log(`✅ Buffer prepared: ${buffer.length} bytes for file ${filename}`);

    await this.ensureTable();

    const fileType = classifyFile(imageFile);
    const ext = path.extname(filename) || (fileType === 'pdf' ? '.pdf' : fileType === 'image' ? '.jpg' : '.bin');
    const storedName = `floor-plan-${Date.now()}${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'floor-plans');
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, storedName), buffer);

    const localUrl = publicFileUrl(`/uploads/floor-plans/${storedName}`);
    let fileUrl = localUrl;
    let cloudinaryPublicId = null;
    let imageWidth = null;
    let imageHeight = null;

    // Images can be public on Cloudinary. Raw PDFs/docs from this cloud return 401,
    // so keep the local /uploads URL for public /layout display.
    if (fileType === 'image') {
      try {
        const uploadResult = await cloudinaryService.uploadFile(buffer, {
          folder: 'exhibition-floor-plans',
          resource_type: 'image',
          public_id: `floor-plan-${Date.now()}`
        });
        if (uploadResult?.url) {
          fileUrl = uploadResult.url;
          cloudinaryPublicId = uploadResult.publicId;
          imageWidth = uploadResult.width || null;
          imageHeight = uploadResult.height || null;
        }
      } catch (cloudError) {
        console.warn('Cloudinary upload skipped, using local file:', cloudError.message);
        fileUrl = localUrl;
      }
    }

    const payload = {
      name: 'Main Exhibition Floor',
      baseImageUrl: fileUrl,
      fileType,
      originalFileName: filename,
      cloudinaryPublicId,
      imageWidth,
      imageHeight,
      isActive: true,
      updatedBy: userId || null
    };

    const floorPlan = await this.persistPlanRecord(payload, userId);

    return {
      success: true,
      data: {
        id: floorPlan.id,
        baseImageUrl: floorPlan.baseImageUrl || fileUrl,
        fileType: floorPlan.fileType || fileType,
        originalFileName: floorPlan.originalFileName || filename,
        imageWidth: floorPlan.imageWidth || imageWidth,
        imageHeight: floorPlan.imageHeight || imageHeight,
        booths: floorPlan.booths || []
      },
      message: 'Floor plan uploaded successfully'
    };
  } catch (error) {
    console.error('❌ Upload floor plan error:', error);
    throw error;
  }
}


  // Add booth with percentage-based positioning
  async addBooth(boothData, userId) {
    try {
      const model = this.FloorPlan;
      if (!model) throw new Error('FloorPlan model not available');

      const floorPlan = await model.findOne({
        where: { isActive: true }
      });

      if (!floorPlan) {
        throw new Error('No active floor plan found');
      }

      if (!floorPlan.imageWidth || !floorPlan.imageHeight) {
        throw new Error('Floor plan image dimensions not set');
      }

      const booths = floorPlan.booths || [];
      
      // Convert pixel coordinates to percentages if provided
      let xPercent = boothData.xPercent;
      let yPercent = boothData.yPercent;
      
      if (boothData.x !== undefined && boothData.y !== undefined) {
        // Convert absolute pixels to percentages
        xPercent = (boothData.x / floorPlan.imageWidth) * 100;
        yPercent = (boothData.y / floorPlan.imageHeight) * 100;
      }

      // Generate booth number if not provided
      if (!boothData.boothNumber) {
        const maxNumber = booths
          .map(b => parseInt(b.boothNumber.replace(/[^0-9]/g, '')) || 0)
          .reduce((max, num) => Math.max(max, num), 0);
        
        const nextNumber = maxNumber + 1;
        boothData.boothNumber = `B${nextNumber}`;
      }

      const newBooth = {
        id: `booth-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        boothNumber: boothData.boothNumber,
        companyName: boothData.companyName || '',
        status: boothData.status || 'available',
        // Store as percentages relative to image size
        xPercent: parseFloat(xPercent.toFixed(4)),
        yPercent: parseFloat(yPercent.toFixed(4)),
        widthPercent: boothData.widthPercent || 10, // Default 10% of image width
        heightPercent: boothData.heightPercent || 8, // Default 8% of image height
        // Store absolute dimensions for reference
        width: boothData.width || 120,
        height: boothData.height || 80,
        // Store text position
        labelXPercent: parseFloat((xPercent + 2).toFixed(4)),
        labelYPercent: parseFloat((yPercent - 2).toFixed(4)),
        // Store status dot position
        dotXPercent: parseFloat((xPercent + 8).toFixed(4)),
        dotYPercent: parseFloat((yPercent - 2).toFixed(4)),
        // Additional metadata
        metadata: boothData.metadata || {}
      };

      booths.push(newBooth);
      floorPlan.booths = booths;
      floorPlan.updatedBy = userId;
      await floorPlan.save();

      return {
        success: true,
        data: newBooth,
        message: 'Booth added successfully'
      };
    } catch (error) {
      console.error('❌ Add booth error:', error);
      throw error;
    }
  }

  // Update booth position (percentage-based)
  async updateBoothPosition(boothId, positionData, userId) {
    try {
      const model = this.FloorPlan;
      if (!model) throw new Error('FloorPlan model not available');

      const floorPlan = await model.findOne({
        where: { isActive: true }
      });

      if (!floorPlan) {
        throw new Error('No active floor plan found');
      }

      if (!floorPlan.imageWidth || !floorPlan.imageHeight) {
        throw new Error('Floor plan image dimensions not set');
      }

      let booths = floorPlan.booths || [];
      const boothIndex = booths.findIndex(b => b.id === boothId);

      if (boothIndex === -1) {
        throw new Error('Booth not found');
      }

      const booth = booths[boothIndex];
      
      // Update position
      if (positionData.x !== undefined && positionData.y !== undefined) {
        // Convert absolute pixels to percentages
        booth.xPercent = (positionData.x / floorPlan.imageWidth) * 100;
        booth.yPercent = (positionData.y / floorPlan.imageHeight) * 100;
        booth.labelXPercent = parseFloat((booth.xPercent + 2).toFixed(4));
        booth.labelYPercent = parseFloat((booth.yPercent - 2).toFixed(4));
        booth.dotXPercent = parseFloat((booth.xPercent + 8).toFixed(4));
        booth.dotYPercent = parseFloat((booth.yPercent - 2).toFixed(4));
      }

      if (positionData.width && positionData.height) {
        booth.widthPercent = (positionData.width / floorPlan.imageWidth) * 100;
        booth.heightPercent = (positionData.height / floorPlan.imageHeight) * 100;
        booth.width = positionData.width;
        booth.height = positionData.height;
      }

      booths[boothIndex] = booth;
      floorPlan.booths = booths;
      floorPlan.updatedBy = userId;
      await floorPlan.save();

      return {
        success: true,
        data: booth,
        message: 'Booth position updated successfully'
      };
    } catch (error) {
      console.error('❌ Update booth position error:', error);
      throw error;
    }
  }

  // Get floor plan with image and booths
  async getFloorPlan() {
    try {
      await this.ensureTable();

      try {
        const floorPlan = await this.FloorPlan.findOne({
          where: { isActive: true },
          order: [['createdAt', 'DESC']]
        });
        if (floorPlan) {
          return this.formatPlan(floorPlan);
        }
      } catch (modelError) {
        console.warn('Floor plan model query failed:', modelError.message);
      }

      try {
        const [rows] = await this.sequelize.query(`
          SELECT * FROM floor_plans
          ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, id DESC
          LIMIT 1
        `);
        if (rows[0] && (rows[0].base_image_url || rows[0].baseImageUrl || rows[0].image)) {
          return this.formatPlan(rows[0]);
        }
      } catch (rawError) {
        console.warn('Floor plan raw query failed:', rawError.message);
      }

      return {
        success: true,
        data: {
          baseImageUrl: null,
          fileType: null,
          originalFileName: null,
          imageWidth: null,
          imageHeight: null,
          booths: []
        }
      };
    } catch (error) {
      console.error('❌ Get floor plan error:', error);
      throw error;
    }
  }

  async saveFloorPlan(booths, userId) {
    try {
      await this.ensureTable();
      const floorPlan = await this.FloorPlan.findOne({
        where: { isActive: true },
        order: [['createdAt', 'DESC']]
      });

      if (!floorPlan) {
        throw new Error('No active floor plan found');
      }

      if (Array.isArray(booths)) {
        floorPlan.booths = booths;
        floorPlan.updatedBy = userId || null;
        await floorPlan.save();
      }

      return this.getFloorPlan();
    } catch (error) {
      console.error('❌ Save floor plan error:', error);
      throw error;
    }
  }

  // Export floor plan as image with overlays
  async exportFloorPlan() {
    try {
      const floorPlan = await this.getFloorPlan();
      if (!floorPlan.data.baseImageUrl) {
        throw new Error('No floor plan image found');
      }

      // Generate a temporary URL with overlays using Cloudinary
      const overlayString = this.generateCloudinaryOverlay(floorPlan.data.booths);
      
      const cloudinary = require('cloudinary').v2;
      const exportUrl = cloudinary.url(floorPlan.data.cloudinaryPublicId, {
        transformation: [
          { width: floorPlan.data.imageWidth, height: floorPlan.data.imageHeight, crop: 'scale' },
          ...overlayString
        ],
        secure: true
      });

      return {
        success: true,
        data: {
          exportUrl,
          imageUrl: floorPlan.data.baseImageUrl
        }
      };
    } catch (error) {
      console.error('❌ Export floor plan error:', error);
      throw error;
    }
  }

  // Generate Cloudinary overlay string for booths
  generateCloudinaryOverlay(booths) {
    const overlays = [];
    
    booths.forEach((booth, index) => {
      const statusColors = {
        available: 'green',
        booked: 'blue',
        reserved: 'orange'
      };

      const color = statusColors[booth.status] || 'gray';
      
      // Add booth box overlay
      overlays.push({
        overlay: {
          font_family: 'Arial',
          font_size: 20,
          text: booth.boothNumber
        },
        color: 'white',
        background: color,
        gravity: 'north_west',
        x: Math.round((booth.xPercent / 100) * floorPlan.data.imageWidth),
        y: Math.round((booth.yPercent / 100) * floorPlan.data.imageHeight),
        width: Math.round((booth.widthPercent / 100) * floorPlan.data.imageWidth),
        height: Math.round((booth.heightPercent / 100) * floorPlan.data.imageHeight),
        border: `2px_solid_${color}`
      });

      // Add status dot
      if (booth.status !== 'available') {
        overlays.push({
          overlay: {
            font_family: 'Arial',
            font_size: 30,
            text: '●'
          },
          color: color,
          gravity: 'north_west',
          x: Math.round((booth.dotXPercent / 100) * floorPlan.data.imageWidth),
          y: Math.round((booth.dotYPercent / 100) * floorPlan.data.imageHeight)
        });
      }

      // Add company name if exists
      if (booth.companyName) {
        overlays.push({
          overlay: {
            font_family: 'Arial',
            font_size: 14,
            text: booth.companyName.substring(0, 20)
          },
          color: 'black',
          background: 'white',
          gravity: 'north_west',
          x: Math.round((booth.xPercent / 100) * floorPlan.data.imageWidth),
          y: Math.round((booth.yPercent / 100) * floorPlan.data.imageHeight + 30)
        });
      }
    });

    return overlays;
  }

  // Reset floor plan
  async resetFloorPlan(userId) {
    try {
      const model = this.FloorPlan;
      if (!model) throw new Error('FloorPlan model not available');

      const floorPlan = await model.findOne({
        where: { isActive: true }
      });

      if (floorPlan) {
        // Delete image from Cloudinary
        if (floorPlan.cloudinaryPublicId) {
          try {
            await cloudinaryService.deleteFile(floorPlan.cloudinaryPublicId);
          } catch (error) {
            console.warn('Failed to delete image:', error.message);
          }
        }

        floorPlan.baseImageUrl = null;
        floorPlan.fileType = null;
        floorPlan.originalFileName = null;
        floorPlan.cloudinaryPublicId = null;
        floorPlan.imageWidth = null;
        floorPlan.imageHeight = null;
        floorPlan.booths = [];
        floorPlan.referencePoints = [];
        floorPlan.updatedBy = userId || null;
        await floorPlan.save();
      }

      return {
        success: true,
        message: 'Floor plan reset successfully'
      };
    } catch (error) {
      console.error('❌ Reset floor plan error:', error);
      throw error;
    }
  }

  // Get booth statistics
  async getBoothStatistics() {
    try {
      const floorPlan = await this.getFloorPlan();
      const booths = floorPlan.data.booths || [];
      
      const stats = {
        total: booths.length,
        available: booths.filter(b => b.status === 'available').length,
        booked: booths.filter(b => b.status === 'booked').length,
        reserved: booths.filter(b => b.status === 'reserved').length,
        occupied: booths.filter(b => b.companyName && b.companyName.trim() !== '').length
      };

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('❌ Get statistics error:', error);
      throw error;
    }
  }

  // Update booth status
  async updateBoothStatus(boothId, status, userId) {
    return this.updateBooth(boothId, { status }, userId);
  }

  // Update company name
  async updateCompanyName(boothId, companyName, userId) {
    return this.updateBooth(boothId, { companyName }, userId);
  }

  // Generic booth update
  async updateBooth(boothId, updateData, userId) {
    try {
      const model = this.FloorPlan;
      if (!model) throw new Error('FloorPlan model not available');

      const floorPlan = await model.findOne({
        where: { isActive: true }
      });

      if (!floorPlan) {
        throw new Error('No active floor plan found');
      }

      let booths = floorPlan.booths || [];
      const boothIndex = booths.findIndex(b => b.id === boothId);

      if (boothIndex === -1) {
        throw new Error('Booth not found');
      }

      booths[boothIndex] = {
        ...booths[boothIndex],
        ...updateData,
        id: boothId
      };

      floorPlan.booths = booths;
      floorPlan.updatedBy = userId;
      await floorPlan.save();

      return {
        success: true,
        data: booths[boothIndex],
        message: 'Booth updated successfully'
      };
    } catch (error) {
      console.error('❌ Update booth error:', error);
      throw error;
    }
  }

  // Delete booth
  async deleteBooth(boothId, userId) {
    try {
      const model = this.FloorPlan;
      if (!model) throw new Error('FloorPlan model not available');

      const floorPlan = await model.findOne({
        where: { isActive: true }
      });

      if (!floorPlan) {
        throw new Error('No active floor plan found');
      }

      let booths = floorPlan.booths || [];
      const initialLength = booths.length;
      
      booths = booths.filter(b => b.id !== boothId);

      if (booths.length === initialLength) {
        throw new Error('Booth not found');
      }

      floorPlan.booths = booths;
      floorPlan.updatedBy = userId;
      await floorPlan.save();

      return {
        success: true,
        message: 'Booth deleted successfully'
      };
    } catch (error) {
      console.error('❌ Delete booth error:', error);
      throw error;
    }
  }
}

module.exports = new BoothService();