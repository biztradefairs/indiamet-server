const express = require('express');
const router = express.Router();
const { authenticateExhibitor } = require('../middleware/auth');

// Get stall details
router.get('/', async (req, res) => {
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
    
    // Parse stall details if they exist
    let stallDetails = exhibitor.stallDetails || {};
    if (typeof stallDetails === 'string') {
      try {
        stallDetails = JSON.parse(stallDetails);
      } catch {
        stallDetails = {};
      }
    }
    
    // Get floor plan if available
    const FloorPlan = modelFactory.getModel('FloorPlan');
    let floorPlan = null;
    let boothInFloorPlan = null;
    
    if (FloorPlan && exhibitor.boothNumber) {
      if (process.env.DB_TYPE !== 'mongodb') {
        floorPlan = await FloorPlan.findOne({
          where: { isActive: true }
        });
      } else {
        floorPlan = await FloorPlan.findOne({ isActive: true });
      }
      
      if (floorPlan && floorPlan.booths) {
        boothInFloorPlan = floorPlan.booths.find(
          booth => booth.boothNumber === exhibitor.boothNumber
        );
      }
    }
    
    res.json({
      success: true,
      data: {
        boothNumber: exhibitor.boothNumber || '',
        stallDetails: {
          // Basic Info
          locationDescription: stallDetails.locationDescription || 'Main Hall, Entrance Area',
          size: stallDetails.size || '3m x 3m',
          type: stallDetails.type || 'Premium',
          price: stallDetails.price || '₹4,500',
          bookedDate: stallDetails.bookedDate || 'Jan 15, 2024',
          status: stallDetails.status || 'confirmed',
          
          // Amenities
          amenities: stallDetails.amenities || [
            'Power Outlets',
            'WiFi',
            'Spotlights',
            'Table & Chairs',
            'Storage'
          ],
          
          // Additional Info
          notes: stallDetails.notes || '',
          floorPlanPosition: boothInFloorPlan ? {
            x: boothInFloorPlan.position?.x || 0,
            y: boothInFloorPlan.position?.y || 0
          } : null
        },
        floorPlan: floorPlan ? {
          id: floorPlan.id,
          name: floorPlan.name,
          imageUrl: floorPlan.imageUrl,
          gridSize: floorPlan.gridSize
        } : null
      }
    });
  } catch (error) {
    console.error('❌ Error fetching stall details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update stall details
router.put('/', async (req, res) => {
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
    
    // Get current stall details or initialize empty object
    let currentStallDetails = exhibitor.stallDetails || {};
    if (typeof currentStallDetails === 'string') {
      try {
        currentStallDetails = JSON.parse(currentStallDetails);
      } catch {
        currentStallDetails = {};
      }
    }
    
    // Merge with new data
    const updatedStallDetails = {
      ...currentStallDetails,
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    // Update exhibitor
    if (process.env.DB_TYPE !== 'mongodb') {
      await Exhibitor.update(
        { 
          stallDetails: JSON.stringify(updatedStallDetails),
          boothNumber: updateData.boothNumber || exhibitor.boothNumber
        },
        { where: { id: req.user.id } }
      );
    } else {
      await Exhibitor.findByIdAndUpdate(req.user.id, {
        stallDetails: updatedStallDetails,
        boothNumber: updateData.boothNumber || exhibitor.boothNumber
      });
    }
    
    // Send notification if amenities changed
    try {
      const kafkaProducer = require('../kafka/producer');
      await kafkaProducer.sendNotification('EXHIBITOR_STALL_UPDATED', req.user.id, {
        old: currentStallDetails,
        new: updatedStallDetails
      });
    } catch (kafkaError) {
      console.warn('Kafka not available:', kafkaError.message);
    }
    
    res.json({
      success: true,
      message: 'Stall details updated successfully',
      data: updatedStallDetails
    });
  } catch (error) {
    console.error('❌ Error updating stall details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available amenities
router.get('/amenities', async (req, res) => {
  try {
    // This could come from a database or config file
    const amenities = [
      { id: 'power', name: 'Power Outlets', category: 'Electrical', price: 0, included: true },
      { id: 'wifi', name: 'WiFi', category: 'Technology', price: 0, included: true },
      { id: 'spotlights', name: 'Spotlights', category: 'Lighting', price: 0, included: true },
      { id: 'furniture', name: 'Table & Chairs', category: 'Furniture', price: 0, included: true },
      { id: 'storage', name: 'Storage', category: 'Storage', price: 0, included: true },
      { id: 'tv', name: 'TV Screen', category: 'Technology', price: 200, included: false },
      { id: 'carpet', name: 'Carpeting', category: 'Flooring', price: 150, included: false },
      { id: 'fascia', name: 'Fascia', category: 'Branding', price: 100, included: false },
      { id: 'lighting', name: 'Additional Lighting', category: 'Lighting', price: 180, included: false },
      { id: 'cleaning', name: 'Daily Cleaning', category: 'Services', price: 120, included: false }
    ];
    
    res.json({
      success: true,
      data: amenities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;