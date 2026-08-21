// src/routes/exhibitorDashboard.js
const express = require('express');
const router = express.Router();
const { authenticateExhibitor } = require('../middleware/auth');

const productRoutes = require('./exhibitorProducts');
const brandRoutes = require('./exhibitorBrands');
const brochureRoutes = require('./exhibitorBrochures');
const stallRoutes = require('./exhibitorStall');

const multer = require('multer');
const upload = multer();

// All routes require exhibitor authentication
router.use(authenticateExhibitor);

router.use('/products', productRoutes);
router.use('/brands', brandRoutes);
router.use('/brochures', brochureRoutes);
router.use('/stall', stallRoutes);

// ==================== PROFILE ROUTES ====================

// GET /profile
router.get('/profile', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    const exhibitorData = exhibitor.toJSON();

    // Safely parse metadata
    let metadata = {};
    if (exhibitorData.metadata) {
      if (typeof exhibitorData.metadata === 'string') {
        try {
          metadata = JSON.parse(exhibitorData.metadata);
        } catch (err) {
          console.error('❌ JSON parse error for metadata:', err.message);
          metadata = {};
        }
      } else {
        metadata = exhibitorData.metadata;
      }
    }

    // Safely parse stallDetails
    let stallDetails = {};
    if (exhibitorData.stallDetails) {
      if (typeof exhibitorData.stallDetails === 'string') {
        try {
          stallDetails = JSON.parse(exhibitorData.stallDetails);
        } catch (err) {
          console.error('❌ JSON parse error for stallDetails:', err.message);
          stallDetails = {};
        }
      } else {
        stallDetails = exhibitorData.stallDetails;
      }
    }

    console.log('✅ Retrieved metadata from DB:', metadata);
    console.log('✅ Logo URL from metadata:', metadata.logoUrl);

    // Build contact person
    const contactPerson = {
      name: metadata.contact_name || metadata.contactPerson?.name || exhibitorData.name || '',
      jobTitle: metadata.contact_job_title || metadata.contactPerson?.jobTitle || '',
      email: exhibitorData.email || metadata.email || '',
      phone: exhibitorData.phone || metadata.phone || '',
      alternatePhone: metadata.alternate_phone || metadata.contactPerson?.alternatePhone || ''
    };

    // Build exhibition object
    const exhibition = {
      pavilion: metadata.pavilion || metadata.exhibition?.pavilion || '',
      hall: metadata.hall || metadata.exhibition?.hall || '',
      standNumber: exhibitorData.boothNumber || metadata.boothNumber || metadata.exhibition?.standNumber || '',
      floorPlanUrl: metadata.floor_plan_url || metadata.exhibition?.floorPlanUrl || ''
    };

    // Build address object
    const address = {
      street: metadata.address_street || metadata.address?.street || '',
      city: metadata.address_city || metadata.address?.city || '',
      state: metadata.address_state || metadata.address?.state || '',
      country: metadata.address_country || metadata.address?.country || '',
      countryCode: metadata.address_country_code || metadata.address?.countryCode || '',
      postalCode: metadata.address_postal_code || metadata.address?.postalCode || ''
    };

    // Parse sector
    let sectorArray = [];
    if (exhibitorData.sector) {
      if (typeof exhibitorData.sector === 'string') {
        sectorArray = exhibitorData.sector.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (Array.isArray(exhibitorData.sector)) {
        sectorArray = exhibitorData.sector;
      }
    } else if (metadata.sector) {
      if (typeof metadata.sector === 'string') {
        sectorArray = metadata.sector.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (Array.isArray(metadata.sector)) {
        sectorArray = metadata.sector;
      }
    }

    // Build social media object
    const socialMedia = {
      website: exhibitorData.website || metadata.website || metadata.socialMedia?.website || '',
      linkedin: metadata.linkedin || metadata.socialMedia?.linkedin || '',
      twitter: metadata.twitter || metadata.socialMedia?.twitter || '',
      facebook: metadata.facebook || metadata.socialMedia?.facebook || '',
      instagram: metadata.instagram || metadata.socialMedia?.instagram || ''
    };

    res.json({
      success: true,
      data: {
        id: exhibitorData.id,
        name: exhibitorData.name,
        email: exhibitorData.email,
        phone: exhibitorData.phone || '',
        company: exhibitorData.company,
        sector: sectorArray,
        boothNumber: exhibitorData.boothNumber || '',
        website: exhibitorData.website || '',
        address: exhibitorData.address || '',
        description: metadata.about || exhibitorData.description || '',
        status: exhibitorData.status || 'active',
        createdAt: exhibitorData.createdAt,
        updatedAt: exhibitorData.updatedAt,

        // Include metadata and stallDetails in response
        metadata: metadata,
        stallDetails: stallDetails,
        
        // Logo URL from metadata
        logoUrl: metadata.logoUrl || '',
        
        // Company info
        shortName: metadata.shortName || metadata.short_name || '',
        registrationNumber: metadata.registrationNumber || metadata.registration_number || '',
        yearEstablished: metadata.yearEstablished || metadata.year_established || '',
        companySize: metadata.companySize || metadata.company_size || '',
        companyType: metadata.companyType || metadata.company_type || '',

        // Contact person
        contactPerson: contactPerson,

        // Exhibition
        exhibition: exhibition,

        // Address
        address: address,

        // Business details
        about: metadata.about || '',
        mission: metadata.mission || '',
        vision: metadata.vision || '',

        // Social media
        socialMedia: socialMedia,

        // Booth fields
        boothSize: stallDetails.size || metadata.boothSize || metadata.booth_size || '',
        boothType: stallDetails.type || metadata.boothType || metadata.booth_type || 'standard',
        boothDimensions: stallDetails.dimensions || metadata.boothDimensions || metadata.booth_dimensions || '',
        boothNotes: stallDetails.notes || metadata.boothNotes || metadata.booth_notes || '',
        boothStatus: metadata.boothStatus || metadata.booth_status || stallDetails.status || 'pending',
        boothPrice: stallDetails.price || metadata.boothPrice || metadata.booth_price || ''
      }
    });

  } catch (error) {
    console.error('❌ PROFILE ERROR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update exhibitor profile
router.put('/profile', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');
    
    let exhibitor;
    if (process.env.DB_TYPE !== 'mongodb') {
      exhibitor = await Exhibitor.findByPk(req.user.id);
    } else {
      exhibitor = await Exhibitor.findById(req.user.id);
    }
    
    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }
    
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated by exhibitor
    delete updateData.id;
    delete updateData.email;
    delete updateData.status;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    
    // CRITICAL: Handle metadata properly - preserve existing metadata and merge
    let existingMetadata = {};
    if (exhibitor.metadata) {
      try {
        existingMetadata = typeof exhibitor.metadata === 'string' 
          ? JSON.parse(exhibitor.metadata) 
          : exhibitor.metadata;
      } catch (e) {
        console.error('Error parsing existing metadata:', e);
        existingMetadata = {};
      }
    }
    
    // Merge new metadata with existing metadata
    if (updateData.metadata) {
      // If metadata is a string, parse it
      let newMetadata = updateData.metadata;
      if (typeof newMetadata === 'string') {
        try {
          newMetadata = JSON.parse(newMetadata);
        } catch (e) {
          console.error('Error parsing new metadata:', e);
          newMetadata = {};
        }
      }
      
      // Merge (existing takes precedence for fields not in new, but new overwrites existing)
      const mergedMetadata = {
        ...existingMetadata,
        ...newMetadata
      };
      
      updateData.metadata = JSON.stringify(mergedMetadata);
      console.log('✅ Merged metadata:', mergedMetadata);
    } else if (existingMetadata && Object.keys(existingMetadata).length > 0) {
      // Keep existing metadata if not provided in update
      updateData.metadata = JSON.stringify(existingMetadata);
    }
    
    // Handle stallDetails properly - preserve existing and merge
    let existingStallDetails = {};
    if (exhibitor.stallDetails) {
      try {
        existingStallDetails = typeof exhibitor.stallDetails === 'string' 
          ? JSON.parse(exhibitor.stallDetails) 
          : exhibitor.stallDetails;
      } catch (e) {
        console.error('Error parsing existing stallDetails:', e);
        existingStallDetails = {};
      }
    }
    
    if (updateData.stallDetails) {
      let newStallDetails = updateData.stallDetails;
      if (typeof newStallDetails === 'string') {
        try {
          newStallDetails = JSON.parse(newStallDetails);
        } catch (e) {
          console.error('Error parsing new stallDetails:', e);
          newStallDetails = {};
        }
      }
      
      const mergedStallDetails = {
        ...existingStallDetails,
        ...newStallDetails
      };
      
      updateData.stallDetails = JSON.stringify(mergedStallDetails);
      console.log('✅ Merged stallDetails:', mergedStallDetails);
    } else if (existingStallDetails && Object.keys(existingStallDetails).length > 0) {
      updateData.stallDetails = JSON.stringify(existingStallDetails);
    }
    
    // Handle password update if needed
    if (updateData.password) {
      const bcrypt = require('bcryptjs');
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    
    // Update exhibitor
    await exhibitor.update(updateData);
    
    // Fetch the updated exhibitor to return
    const updatedExhibitor = await Exhibitor.findByPk(req.user.id);
    const responseData = updatedExhibitor.toJSON();
    
    // Parse metadata for response
    let responseMetadata = {};
    if (responseData.metadata) {
      try {
        responseMetadata = typeof responseData.metadata === 'string' 
          ? JSON.parse(responseData.metadata) 
          : responseData.metadata;
      } catch (e) {
        console.error('Error parsing response metadata:', e);
      }
    }
    
    // Parse stallDetails for response
    let responseStallDetails = {};
    if (responseData.stallDetails) {
      try {
        responseStallDetails = typeof responseData.stallDetails === 'string' 
          ? JSON.parse(responseData.stallDetails) 
          : responseData.stallDetails;
      } catch (e) {
        console.error('Error parsing response stallDetails:', e);
      }
    }
    
    // Build response with parsed data
    const formattedResponse = {
      id: responseData.id,
      name: responseData.name,
      email: responseData.email,
      company: responseData.company,
      phone: responseData.phone,
      boothNumber: responseData.boothNumber,
      sector: responseData.sector,
      website: responseData.website,
      address: responseData.address,
      status: responseData.status,
      createdAt: responseData.createdAt,
      updatedAt: responseData.updatedAt,
      metadata: responseMetadata,
      stallDetails: responseStallDetails,
      // Also include logoUrl at top level for easier access
      logoUrl: responseMetadata.logoUrl || responseData.logoUrl || ''
    };
    
    res.json({
      success: true,
      data: formattedResponse,
      message: 'Profile updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DASHBOARD ROUTES ====================

// Get exhibitor's complete dashboard data - FIXED VERSION
router.get('/layout', async (req, res) => {
  try {
    console.log('📊 Fetching dashboard layout for exhibitor:', req.user.id);
    
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    // Get exhibitor
    let exhibitor;
    if (process.env.DB_TYPE !== 'mongodb') {
      exhibitor = await Exhibitor.findByPk(req.user.id);
    } else {
      exhibitor = await Exhibitor.findById(req.user.id);
    }

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    // Get floor plan safely - handle missing model
    let floorPlan = null;
    try {
      const FloorPlan = modelFactory.getModel('FloorPlan');
      if (FloorPlan) {
        if (process.env.DB_TYPE !== 'mongodb') {
          floorPlan = await FloorPlan.findOne({
            where: { isActive: true }
          });
        } else {
          floorPlan = await FloorPlan.findOne({ isActive: true });
        }
      }
    } catch (floorPlanError) {
      console.warn('⚠️ FloorPlan model not available:', floorPlanError.message);
    }

    // Parse stall details
    let stallDetails = {};
    if (exhibitor.stallDetails) {
      try {
        stallDetails = typeof exhibitor.stallDetails === 'string' 
          ? JSON.parse(exhibitor.stallDetails) 
          : exhibitor.stallDetails;
      } catch (e) {
        console.warn('Failed to parse stallDetails:', e.message);
      }
    }

    // Get invoices safely - handle missing service
    let invoices = [];
    try {
      const invoiceService = require('../services/InvoiceService');
      if (invoiceService && typeof invoiceService.getInvoicesByExhibitor === 'function') {
        invoices = await invoiceService.getInvoicesByExhibitor(exhibitor.id);
      } else {
        console.warn('⚠️ InvoiceService not available, returning empty invoices');
      }
    } catch (invoiceError) {
      console.warn('⚠️ Failed to fetch invoices:', invoiceError.message);
    }

    // Get requirements
    let requirements = [];
    try {
      const Requirement = modelFactory.getModel('Requirement');
      if (Requirement) {
        if (process.env.DB_TYPE !== 'mongodb') {
          requirements = await Requirement.findAll({
            where: { exhibitorId: exhibitor.id },
            order: [['createdAt', 'DESC']],
            limit: 5
          });
        } else {
          requirements = await Requirement.find({ exhibitorId: exhibitor.id })
            .sort({ createdAt: -1 })
            .limit(5);
        }
      }
    } catch (reqError) {
      console.warn('⚠️ Failed to fetch requirements:', reqError.message);
    }

    // Prepare booth details
    let boothDetails = null;
    if (floorPlan && exhibitor.boothNumber) {
      const booths = floorPlan.booths || [];
      boothDetails = booths.find(booth => booth.boothNumber === exhibitor.boothNumber);
    }

    // Get event details from config or database
    let event = null;
    try {
      const Event = modelFactory.getModel('Event');
      if (Event) {
        if (process.env.DB_TYPE !== 'mongodb') {
          event = await Event.findOne({
            where: { isActive: true }
          });
        } else {
          event = await Event.findOne({ isActive: true });
        }
      }
    } catch (eventError) {
      console.warn('⚠️ Event model not available');
    }

    // Fallback event data if not found
    const eventData = event || {
      name: 'DIEMEX 2026',
      venue: 'Auto Cluster Exhibition Center',
      exhibitionDay: '8th October, 2026',
      dismantleDay: '10th October, 2026'
    };

    // Response
    res.json({
      success: true,
      data: {
        exhibitor: {
          id: exhibitor.id,
          name: exhibitor.name,
          company: exhibitor.company,
          email: exhibitor.email,
          phone: exhibitor.phone || '',
          boothNumber: exhibitor.boothNumber || '',
          stallDetails: stallDetails,
          sector: exhibitor.sector || '',
          website: exhibitor.website || '',
          address: exhibitor.address || '',
          description: exhibitor.description || '',
          status: exhibitor.status === 'approved' ? 'active' : (exhibitor.status || 'pending')
        },
        floorPlan: floorPlan ? {
          id: floorPlan.id,
          name: floorPlan.name,
          floor: floorPlan.floor,
          gridSize: floorPlan.gridSize
        } : null,
        booth: boothDetails || null,
        invoices: invoices.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          status: inv.status,
          dueDate: inv.dueDate
        })),
        requirements: requirements.map(req => ({
          id: req.id,
          type: req.type,
          description: req.description,
          status: req.status
        })),
        event: eventData
      }
    });

  } catch (error) {
    console.error('❌ Layout error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard data'
    });
  }
});

// ==================== INVOICE ROUTES ====================

// Get exhibitor's invoices
router.get('/invoices', async (req, res) => {
  try {
    let invoices = [];
    try {
      const invoiceService = require('../services/InvoiceService');
      if (invoiceService && typeof invoiceService.getInvoicesByExhibitor === 'function') {
        invoices = await invoiceService.getInvoicesByExhibitor(req.user.id);
      }
    } catch (error) {
      console.warn('⚠️ InvoiceService not available:', error.message);
    }
    
    res.json({
      success: true,
      data: invoices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Download invoice PDF
router.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const invoiceService = require('../services/InvoiceService');
    if (!invoiceService || typeof invoiceService.generateInvoicePdf !== 'function') {
      throw new Error('Invoice service not available');
    }
    
    const pdfBuffer = await invoiceService.generateInvoicePdf(req.params.id);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Make payment
router.post('/invoices/:id/pay', async (req, res) => {
  try {
    const { method, transactionId } = req.body;
    
    const invoiceService = require('../services/InvoiceService');
    const paymentService = require('../services/PaymentService');
    
    if (!invoiceService || !paymentService) {
      throw new Error('Required services not available');
    }
    
    // Get invoice
    const invoice = await invoiceService.getInvoiceById(req.params.id);
    
    // Verify invoice belongs to exhibitor
    if (invoice.exhibitorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to pay this invoice'
      });
    }
    
    // Create payment
    const payment = await paymentService.createPayment({
      invoiceId: invoice.id,
      exhibitorId: req.user.id,
      amount: invoice.amount,
      method: method || 'online',
      transactionId: transactionId || `TXN-${Date.now()}`,
      status: 'completed',
      notes: 'Payment made from exhibitor portal'
    });
    
    // Mark invoice as paid if service available
    if (typeof invoiceService.markInvoiceAsPaid === 'function') {
      await invoiceService.markInvoiceAsPaid(invoice.id, payment.id);
    }
    
    res.json({
      success: true,
      message: 'Payment successful',
      data: {
        payment,
        invoice: {
          ...invoice.toJSON(),
          status: 'paid'
        }
      }
    });
  } catch (error) {
    console.error('❌ Payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== REQUIREMENT ROUTES ====================

// Get exhibitor's requirements
router.get('/requirements', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Requirement = modelFactory.getModel('Requirement');
    
    let requirements = [];
    
    if (Requirement) {
      if (process.env.DB_TYPE !== 'mongodb') {
        requirements = await Requirement.findAll({
          where: { exhibitorId: req.user.id },
          order: [['createdAt', 'DESC']]
        });
      } else {
        requirements = await Requirement.find({ exhibitorId: req.user.id }).sort({ createdAt: -1 });
      }
    }
    
    res.json({
      success: true,
      data: requirements
    });
  } catch (error) {
    console.error('❌ Requirements error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Submit requirement

router.get('/debug/requirements-table', async (req, res) => {
  try {
    const sequelize = require('../config/database').getConnection('mysql');
    
    // Get table structure
    const [columns] = await sequelize.query(`
      SHOW COLUMNS FROM requirements
    `);
    
    // Get sample data (if any)
    const [sample] = await sequelize.query(`
      SELECT * FROM requirements LIMIT 1
    `);
    
    res.json({
      success: true,
      tableStructure: columns,
      sampleData: sample,
      columnNames: columns.map(c => c.Field)
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.post('/requirements', async (req, res) => {
  try {
    console.log("📝 Submitting requirement for exhibitor:", req.user?.id);
    
    const { type, description, ...restData } = req.body;

    if (!type || !description) {
      return res.status(400).json({
        success: false,
        error: 'Type and description are required'
      });
    }

    // Collect all data
    const completeData = {
      ...restData,
      submittedAt: new Date().toISOString(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    };

    console.log('📦 Saving requirement data...');
    console.log('Keys:', Object.keys(completeData));
    console.log('Housekeeping:', completeData.housekeepingStaff);

    const modelFactory = require('../models');
    const Requirement = modelFactory.getModel('Requirement');
    const requirementId = require('crypto').randomUUID();
    const now = new Date();

    const created = await Requirement.create({
      id: requirementId,
      exhibitorId: req.user?.id,
      type,
      description,
      quantity: 1,
      status: 'pending',
      data: completeData
    });

    console.log('✅ Requirement saved with ID:', created.id);

    res.json({
      success: true,
      message: 'Requirement submitted successfully',
      data: {
        id: created.id,
        type: created.type,
        status: created.status,
        createdAt: created.createdAt || now
      }
    });

  } catch (error) {
    console.error("❌ REQUIREMENT ERROR:", error);
    console.error("Stack:", error.stack);
    
    // Send detailed error in development, generic in production
    res.status(500).json({
      success: false,
      error: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// Get booth details
router.get('/booth', async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const exhibitor = await Exhibitor.findByPk(req.user.id);

    if (!exhibitor) {
      return res.status(404).json({
        success: false,
        error: 'Exhibitor not found'
      });
    }

    // Safely parse stallDetails
    let stallDetails = {};
    if (exhibitor.stallDetails) {
      if (typeof exhibitor.stallDetails === 'string') {
        try {
          stallDetails = JSON.parse(exhibitor.stallDetails);
        } catch (err) {
          console.error('❌ JSON parse error for stallDetails:', err.message);
          stallDetails = {};
        }
      } else {
        stallDetails = exhibitor.stallDetails;
      }
    }

    res.json({
      success: true,
      data: {
        boothNumber: exhibitor.boothNumber || '',
        stallDetails: stallDetails,
        size: stallDetails.size || '',
        type: stallDetails.type || 'standard',
        dimensions: stallDetails.dimensions || '',
        notes: stallDetails.notes || '',
        price: stallDetails.price || '',
        status: stallDetails.status || 'pending'
      }
    });

  } catch (error) {
    console.error('❌ BOOTH ERROR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== MANUAL ROUTES ====================

// Get manual
router.get('/manual', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        sections: [
          {
            id: '1',
            title: 'Event Overview',
            content: 'Welcome to the exhibition. The event will take place from January 29-31, 2024 at the Convention Center.'
          },
          {
            id: '2',
            title: 'Setup Schedule',
            content: 'Setup begins on January 28 from 8:00 AM to 6:00 PM. All exhibitors must complete setup by 6:00 PM.'
          },
          {
            id: '3',
            title: 'Event Hours',
            content: 'Exhibition hours: 9:00 AM - 6:00 PM daily. Networking events: 7:00 PM - 10:00 PM.'
          }
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;