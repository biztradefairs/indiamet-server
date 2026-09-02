const cloudinary = require('cloudinary').v2;
const path = require('path');

class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    console.log('☁️ Cloudinary configured');
  }

  pagePreviewUrl(publicId, page = 1) {
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      format: 'jpg',
      page,
      quality: 'auto'
    });
  }

  imageUrl(publicId) {
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: 'image',
      type: 'upload'
    });
  }

  downloadUrl(publicId, { fileType, fileName } = {}) {
    const safeName = String(fileName || 'INDIAMET-Floor-Plan')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w.-]+/g, '_');

    if (fileType === 'document') {
      return this.signedRawUrl(publicId);
    }

    return cloudinary.url(publicId, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      format: fileType === 'pdf' ? 'pdf' : undefined,
      flags: `attachment:${safeName}`
    });
  }

  // ================================
  // Upload File (Image / PDF / Any)
  // ================================
  async uploadFile(fileBuffer, options = {}) {
    try {
      const { filename, ...rest } = options;
      const uploadOptions = {
        folder: 'exhibition-files',
        resource_type: rest.resource_type || 'image',
        type: 'upload',
        ...rest
      };

      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(fileBuffer);
      });

      console.log('✅ Uploaded to Cloudinary:', result.public_id);

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        pages: result.pages,
        resourceType: result.resource_type
      };

    } catch (error) {
      console.error('❌ Cloudinary upload error:', error.message);
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  async uploadFloorPlan(fileBuffer, { fileType, filename } = {}) {
    const ext = path.extname(filename || '').toLowerCase();
    const stamp = `floor-plan-${Date.now()}`;

    const tryUpload = async (resourceType, publicId) => this.uploadFile(fileBuffer, {
      folder: 'exhibition-floor-plans',
      resource_type: resourceType,
      public_id: publicId,
      overwrite: true,
      invalidate: true
    });

    let result;
    let resourceType = fileType === 'document' ? 'raw' : 'image';

    try {
      result = await tryUpload(
        resourceType,
        resourceType === 'raw' ? `${stamp}${ext || ''}` : stamp
      );
    } catch (error) {
      if (fileType !== 'pdf') throw error;
      resourceType = 'raw';
      result = await tryUpload('raw', `${stamp}.pdf`);
    }

    const displayUrl = fileType === 'pdf' && resourceType === 'image'
      ? this.pagePreviewUrl(result.publicId, 1)
      : fileType === 'document' || resourceType === 'raw'
        ? this.signedRawUrl(result.publicId)
        : result.url;

    return {
      ...result,
      url: displayUrl,
      originalUrl: result.url,
      resourceType
    };
  }

  // ================================
  // Delete File
  // ================================
 async deleteFile(publicId, resourceType = 'image') {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });

    if (result.result !== 'ok') {
      throw new Error(result.result);
    }

    console.log('🗑️ Deleted from Cloudinary:', publicId);
    return true;

  } catch (error) {
    console.error('❌ Cloudinary delete error:', error.message);
    throw new Error(`Delete failed: ${error.message}`);
  }
}

  // ================================
  // Test Connection
  // ================================
  async testConnection() {
    try {
      await cloudinary.api.ping();
      console.log('✅ Cloudinary connection successful');
      return true;
    } catch (error) {
      console.error('❌ Cloudinary connection failed:', error.message);
      return false;
    }
  }
}

module.exports = new CloudinaryService();