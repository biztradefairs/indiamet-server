// src/routes/extraRequirementsRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// Helper function to extract items from requirement data
const extractRequirementItems = (data) => {
  const items = [];
  
  // Extract furniture items
  if (data.furnitureItems && Array.isArray(data.furnitureItems)) {
    data.furnitureItems.forEach(item => {
      items.push({
        id: item.id || `furniture_${Date.now()}_${Math.random()}`,
        type: 'Furniture',
        quantity: item.quantity || 1,
        description: item.description || `Furniture: ${item.code}`,
        specifications: `Code: ${item.code}, Cost: ₹${item.cost}`,
        unitPrice: item.cost,
        totalPrice: item.cost * (item.quantity || 1)
      });
    });
  }
  
  // Extract AV & IT Rentals
  if (data.rentalItems && Array.isArray(data.rentalItems)) {
    data.rentalItems.forEach(item => {
      items.push({
        id: item.id || `rental_${Date.now()}_${Math.random()}`,
        type: 'AV & IT Rentals',
        quantity: item.quantity || 1,
        description: item.description || `Rental: ${item.type}`,
        specifications: `Type: ${item.type}, Cost: ₹${item.costFor3Days}`,
        unitPrice: item.costFor3Days,
        totalPrice: item.totalCost
      });
    });
  }
  
  // Extract Electrical Load
  if (data.electricalLoad) {
    if (data.electricalLoad.exhibitionLoad && data.electricalLoad.exhibitionLoad !== '') {
      items.push({
        id: `electrical_exhibition_${Date.now()}_${Math.random()}`,
        type: 'Electrical Load',
        quantity: parseInt(data.electricalLoad.exhibitionLoad) || 0,
        description: 'Exhibition Electrical Load',
        specifications: `Load: ${data.electricalLoad.exhibitionLoad} kW, Total: ₹${data.electricalLoad.exhibitionTotal}`,
        unitPrice: data.electricalLoad.exhibitionTotal,
        totalPrice: data.electricalLoad.exhibitionTotal
      });
    }
    if (data.electricalLoad.temporaryLoad && data.electricalLoad.temporaryLoad !== '') {
      items.push({
        id: `electrical_temporary_${Date.now()}_${Math.random()}`,
        type: 'Electrical Load',
        quantity: parseInt(data.electricalLoad.temporaryLoad) || 0,
        description: 'Temporary Electrical Load',
        specifications: `Load: ${data.electricalLoad.temporaryLoad} kW, Total: ₹${data.electricalLoad.temporaryTotal}`,
        unitPrice: data.electricalLoad.temporaryTotal,
        totalPrice: data.electricalLoad.temporaryTotal
      });
    }
  }
  
  // Extract Hostess Requirements
  if (data.hostessRequirements && Array.isArray(data.hostessRequirements)) {
    data.hostessRequirements.forEach((item, index) => {
      items.push({
        id: `hostess_${index}_${Date.now()}_${Math.random()}`,
        type: 'Hostess Services',
        quantity: item.quantity || 1,
        description: `Hostess Category ${item.category}`,
        specifications: `${item.noOfDays} days at ₹${item.ratePerDay}/day`,
        unitPrice: item.ratePerDay,
        totalPrice: item.amount
      });
    });
  }
  
  // Extract Compressed Air
  if (data.compressedAir && data.compressedAir.qty) {
    items.push({
      id: `compressed_air_${Date.now()}_${Math.random()}`,
      type: 'Compressed Air',
      quantity: data.compressedAir.qty || 1,
      description: 'Compressed Air Connection',
      specifications: `CFM: ${data.compressedAir.cfmRange || 'Standard'}, Power: ${data.compressedAir.powerKW} kW`,
      unitPrice: data.compressedAir.costPerConnection,
      totalPrice: data.compressedAir.totalCost
    });
  }
  
  // Extract Water Connection
  if (data.waterConnection && data.waterConnection.connections) {
    items.push({
      id: `water_${Date.now()}_${Math.random()}`,
      type: 'Water Connection',
      quantity: data.waterConnection.connections || 1,
      description: 'Water Connection',
      specifications: `${data.waterConnection.connections} connections at ₹${data.waterConnection.costPerConnection}/each`,
      unitPrice: data.waterConnection.costPerConnection,
      totalPrice: data.waterConnection.totalCost
    });
  }
  
  // Extract Security Guard
  if (data.securityGuard && data.securityGuard.quantity) {
    items.push({
      id: `security_${Date.now()}_${Math.random()}`,
      type: 'Security Guard',
      quantity: data.securityGuard.quantity || 1,
      description: 'Security Guard Service',
      specifications: `${data.securityGuard.noOfDays} days`,
      unitPrice: data.securityGuard.totalCost / data.securityGuard.quantity,
      totalPrice: data.securityGuard.totalCost
    });
  }
  
  // Extract Housekeeping
  if (data.housekeepingStaff && data.housekeepingStaff.quantity) {
    items.push({
      id: `housekeeping_${Date.now()}_${Math.random()}`,
      type: 'Housekeeping',
      quantity: data.housekeepingStaff.quantity || 1,
      description: 'Housekeeping Staff',
      specifications: `${data.housekeepingStaff.noOfDays} days at ₹${data.housekeepingStaff.chargesPerShift}/shift`,
      unitPrice: data.housekeepingStaff.chargesPerShift,
      totalPrice: data.housekeepingStaff.totalCost
    });
  }
  
  // Extract Security Deposit
  if (data.securityDeposit && data.securityDeposit.amountINR > 0) {
    items.push({
      id: `deposit_${Date.now()}_${Math.random()}`,
      type: 'Security Deposit',
      quantity: 1,
      description: 'Security Deposit',
      specifications: `Booth Size: ${data.securityDeposit.boothSq || 'Standard'}`,
      unitPrice: data.securityDeposit.amountINR,
      totalPrice: data.securityDeposit.amountINR
    });
  }
  
  return items;
};

const parseStoredData = (record) => {
  const raw = record.data || record.metadata;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
};

const formatRequirement = (record, exhibitor) => {
  const json = record.toJSON ? record.toJSON() : record;
  const parsedData = parseStoredData(json);
  const generalInfo = parsedData.generalInfo || {};
  const boothDetails = parsedData.boothDetails || {};
  const exhibitorJson = exhibitor?.toJSON ? exhibitor.toJSON() : exhibitor || {};
  const contactName = [
    generalInfo.title,
    generalInfo.firstName,
    generalInfo.lastName
  ].filter(Boolean).join(' ');

  return {
    id: json.id,
    requirementId: json.id,
    exhibitorId: json.exhibitorId,
    stallNumber: boothDetails.boothNo || exhibitorJson.boothNumber || null,
    companyName: generalInfo.companyName || exhibitorJson.company || exhibitorJson.name || 'Unknown',
    contactPerson: boothDetails.contactPerson || contactName || exhibitorJson.name || 'Unknown',
    email: generalInfo.email || exhibitorJson.email || '',
    phone: generalInfo.mobile || exhibitorJson.phone || '',
    status: json.status || 'pending',
    submittedAt: json.createdAt,
    updatedAt: json.updatedAt,
    notes: parsedData.notes || json.notes || '',
    adminNotes: parsedData.adminNotes || '',
    items: extractRequirementItems(parsedData),
    metadata: {
      boothArea: boothDetails.sqMtrBooked,
      boothLocation: boothDetails.boothNo,
      eventName: parsedData.eventName || 'INDIAMET',
      eventDate: parsedData.eventDate,
      address: parsedData.companyDetails?.address,
      city: parsedData.companyDetails?.city,
      state: parsedData.companyDetails?.state,
      pincode: parsedData.companyDetails?.pincode
    }
  };
};

// =============================================
// ADMIN ROUTES
// =============================================

// Get all extra requirements (admin)
router.get('/admin/all', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { search, status } = req.query;
    const modelFactory = require('../models');
    const { Op } = require('sequelize');
    const Requirement = modelFactory.getModel('Requirement');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const where = {};
    if (status && status !== 'all') {
      where.status = status;
    }
    if (search) {
      where[Op.or] = [
        { description: { [Op.iLike]: `%${search}%` } },
        { type: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const requirements = await Requirement.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    const exhibitorIds = [...new Set(requirements.map((item) => item.exhibitorId).filter(Boolean))];
    const exhibitors = exhibitorIds.length
      ? await Exhibitor.findAll({ where: { id: exhibitorIds } })
      : [];
    const exhibitorMap = Object.fromEntries(exhibitors.map((exhibitor) => [exhibitor.id, exhibitor]));

    const formattedRequirements = requirements.map((item) =>
      formatRequirement(item, exhibitorMap[item.exhibitorId])
    );

    res.json({
      success: true,
      data: formattedRequirements
    });
  } catch (error) {
    console.error('Error fetching extra requirements:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/admin/stats', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const modelFactory = require('../models');
    const { Op } = require('sequelize');
    const Requirement = modelFactory.getModel('Requirement');

    const [total, pending, approved, rejected, completed] = await Promise.all([
      Requirement.count(),
      Requirement.count({ where: { status: 'pending' } }),
      Requirement.count({ where: { status: 'approved' } }),
      Requirement.count({ where: { status: 'rejected' } }),
      Requirement.count({ where: { status: 'completed' } })
    ]);

    const uniqueExhibitors = await Requirement.count({
      distinct: true,
      col: 'exhibitorId',
      where: { exhibitorId: { [Op.ne]: null } }
    });

    res.json({
      success: true,
      data: { total, pending, approved, rejected, completed, uniqueExhibitors }
    });
  } catch (error) {
    console.error('Error fetching requirement stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single requirement by ID (admin)
router.get('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Requirement = modelFactory.getModel('Requirement');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const record = await Requirement.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    const exhibitor = record.exhibitorId
      ? await Exhibitor.findByPk(record.exhibitorId)
      : null;

    res.json({
      success: true,
      data: formatRequirement(record, exhibitor)
    });
  } catch (error) {
    console.error('Error fetching requirement details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update requirement status (admin)
router.put('/admin/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const modelFactory = require('../models');
    const Requirement = modelFactory.getModel('Requirement');
    const Exhibitor = modelFactory.getModel('Exhibitor');

    const record = await Requirement.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    const parsedData = parseStoredData(record);
    parsedData.adminNotes = adminNotes;
    parsedData.updatedBy = req.user?.id;
    parsedData.updatedAt = new Date().toISOString();

    await record.update({
      status: status || record.status,
      data: parsedData
    });

    const exhibitor = record.exhibitorId
      ? await Exhibitor.findByPk(record.exhibitorId)
      : null;

    res.json({
      success: true,
      data: formatRequirement(record, exhibitor)
    });
  } catch (error) {
    console.error('Error updating requirement:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
