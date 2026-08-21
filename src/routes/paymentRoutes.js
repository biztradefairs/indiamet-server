// src/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateExhibitor, authenticate, authorize } = require('../middleware/auth');
const crypto = require('crypto');

const mapPaymentMethod = (mode = '') => {
  const value = String(mode).toLowerCase();
  if (value.includes('card') || value.includes('credit')) return 'credit_card';
  if (value.includes('bank') || value.includes('neft') || value.includes('rtgs') || value.includes('dd')) return 'bank_transfer';
  if (value.includes('cheque') || value.includes('check')) return 'check';
  if (value.includes('online') || value.includes('cashfree') || value.includes('upi')) return 'online';
  if (value.includes('cash')) return 'cash';
  return 'online';
};

const mapPaymentStatus = (status = '') => {
  const value = String(status).toLowerCase();
  if (value.includes('paid') || value.includes('complet') || value.includes('verif')) return 'completed';
  if (value.includes('fail') || value.includes('reject')) return 'failed';
  if (value.includes('refund')) return 'refunded';
  return 'pending';
};

const serializePayment = (payment, exhibitor) => {
  const json = payment.toJSON ? payment.toJSON() : payment;
  return {
    id: json.id,
    invoiceNumber: json.invoiceNumber,
    company: exhibitor?.company || json.metadata?.company || json.invoiceNumber,
    amount: Number(json.amount) || 0,
    status: json.status,
    method: json.method,
    date: json.date,
    dueDate: json.dueDate,
    processedBy: json.processedBy || 'System',
    exhibitorName: exhibitor?.name,
    transactionId: json.transactionId,
    notes: json.notes
  };
};

const loadExhibitorsByIds = async (ids) => {
  const modelFactory = require('../models');
  const Exhibitor = modelFactory.getModel('Exhibitor');
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};
  const exhibitors = await Exhibitor.findAll({ where: { id: uniqueIds } });
  return Object.fromEntries(exhibitors.map((exhibitor) => [exhibitor.id, exhibitor.toJSON()]));
};

// ==================== CASH/CHEQUE/DD PAYMENT ROUTES ====================

// Submit cash payment details
router.post('/cash-payment', authenticateExhibitor, async (req, res) => {
  try {
    const {
      requirementId,
      invoiceId,
      amount,
      amountPaid,
      paymentMode,
      paymentDate,
      remarks,
      status = 'pending'
    } = req.body;

    const paymentService = require('../services/PaymentService');
    const modelFactory = require('../models');
    const Invoice = modelFactory.getModel('Invoice');

    let invoiceNumber = `PAY-${Date.now()}`;
    if (invoiceId) {
      const invoice = await Invoice.findByPk(invoiceId);
      if (invoice?.invoiceNumber) {
        invoiceNumber = invoice.invoiceNumber;
      }
    }

    const payment = await paymentService.createPayment({
      invoiceNumber,
      invoiceId: invoiceId || null,
      exhibitorId: req.user.id,
      amount: amountPaid || amount,
      method: mapPaymentMethod(paymentMode),
      status: mapPaymentStatus(status),
      date: paymentDate || new Date(),
      processedBy: req.user.company || req.user.name || 'Exhibitor',
      notes: remarks || null,
      metadata: {
        requirementId,
        paymentMode
      }
    });

    if (invoiceId) {
      await Invoice.update(
        { status: payment.status === 'completed' ? 'paid' : 'pending' },
        { where: { id: invoiceId } }
      );
    }

    res.json({
      success: true,
      message: 'Payment submitted successfully',
      data: {
        paymentId: payment.id,
        paymentReference: payment.transactionId,
        status: payment.status
      }
    });

  } catch (error) {
    console.error('Cash payment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== USER ROUTES ====================

// Get my payments
router.get('/my-payments', authenticateExhibitor, async (req, res) => {
  try {
    const paymentService = require('../services/PaymentService');
    const result = await paymentService.getAllPayments({ exhibitorId: req.user.id }, 1, 500);
    res.json({ success: true, data: result.payments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ADMIN ROUTES ====================

// Pending payments
router.get('/admin/pending', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const paymentService = require('../services/PaymentService');
    const result = await paymentService.getAllPayments({ status: 'pending' }, 1, 500);
    const exhibitors = await loadExhibitorsByIds(result.payments.map((payment) => payment.exhibitorId));
    res.json({
      success: true,
      data: result.payments.map((payment) => serializePayment(payment, exhibitors[payment.exhibitorId]))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// All payments
router.get('/admin/all', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const sequelize = require('../config/database').getConnection('mysql');
    const [payments] = await sequelize.query(`
      SELECT
        p.id,
        p."invoiceNumber",
        p."invoiceId",
        p."exhibitorId",
        p.amount,
        p.status,
        p.method,
        p.date,
        p."dueDate",
        p."processedBy",
        p."transactionId",
        p.notes,
        e.company,
        e.name AS exhibitor_name
      FROM payments p
      LEFT JOIN exhibitors e ON e.id = p."exhibitorId"
      ORDER BY p.date DESC NULLS LAST
    `);

    res.json({
      success: true,
      data: payments.map((payment) => serializePayment(payment, {
        company: payment.company,
        name: payment.exhibitor_name
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify payment
router.put('/admin/:paymentId/verify', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status, adminRemarks } = req.body;
    const paymentService = require('../services/PaymentService');
    const mappedStatus = mapPaymentStatus(status);
    const payment = await paymentService.updatePaymentStatus(paymentId, mappedStatus, adminRemarks || '');

    if (mappedStatus === 'completed' && payment.invoiceId) {
      const modelFactory = require('../models');
      const Invoice = modelFactory.getModel('Invoice');
      await Invoice.update(
        { status: 'paid', paidDate: new Date() },
        { where: { id: payment.invoiceId } }
      );
    }

    res.json({ success: true, message: 'Payment updated successfully', data: payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id/status', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const paymentService = require('../services/PaymentService');
    const payment = await paymentService.updatePaymentStatus(
      req.params.id,
      mapPaymentStatus(req.body.status),
      req.body.notes || ''
    );
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/refund', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const paymentService = require('../services/PaymentService');
    const result = await paymentService.refundPayment(req.params.id, req.body.reason || 'Admin refund');
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stats
router.get('/admin/stats', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const paymentService = require('../services/PaymentService');
    const stats = await paymentService.getPaymentStats('year');
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== IMPORTANT: KEEP THIS LAST ====================

// Get single payment
router.get('/:paymentId', authenticateExhibitor, async (req, res) => {
  try {
    const paymentService = require('../services/PaymentService');
    const payment = await paymentService.getPaymentById(req.params.paymentId);
    if (payment.exhibitorId && payment.exhibitorId !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

module.exports = router;