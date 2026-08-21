// src/routes/invoiceGenerateRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, authenticateAny, authorize } = require('../middleware/auth');
const axios = require('axios');

// =============================================
// PUBLIC / EXHIBITOR ROUTES (with authentication)
// =============================================

// Generate invoice from requirements (for exhibitors after submission)
router.post('/generate-from-requirements', authenticateAny, async (req, res) => {
  try {
    console.log('📝 Generating invoice from requirements...');
    console.log('User:', req.user);
    
    const { 
      requirementsId, 
      exhibitorInfo, 
      paymentInfo, 
      items, 
      totals,
      invoiceNumber,
      issueDate,
      dueDate,
      notes 
    } = req.body;
    
    if (!requirementsId) {
      return res.status(400).json({
        success: false,
        error: 'Requirements ID is required'
      });
    }
    
    const modelFactory = require('../models');
    const sequelize = require('../config/database').getConnection('mysql');
    
    // Get the requirement data
    const [requirements] = await sequelize.query(`
      SELECT * FROM requirements WHERE id = ?
    `, {
      replacements: [requirementsId]
    });
    
    if (!requirements || requirements.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Requirement not found'
      });
    }
    
    const requirement = requirements[0];
    const exhibitorId = req.user?.id || requirement.exhibitorId;
    
    // Check if invoice already exists for this requirement
    let existingInvoice = null;
    try {
      const [invoices] = await sequelize.query(`
        SELECT * FROM invoices 
        WHERE JSON_EXTRACT(metadata, '$.requirementsId') = ?
        LIMIT 1
      `, {
        replacements: [requirementsId]
      });
      
      if (invoices && invoices.length > 0) {
        existingInvoice = invoices[0];
        if (existingInvoice.metadata && typeof existingInvoice.metadata === 'string') {
          existingInvoice.metadata = JSON.parse(existingInvoice.metadata);
        }
      }
    } catch (error) {
      console.log('No existing invoice found or metadata query failed');
    }
    
    if (existingInvoice) {
      return res.json({
        success: true,
        data: existingInvoice,
        message: 'Invoice already exists for this requirement'
      });
    }
    
    // Create invoice number
    const finalInvoiceNumber = invoiceNumber || `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const finalIssueDate = issueDate || new Date().toISOString();
    const finalDueDate = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Generate UUID for invoice
    const invoiceId = require('crypto').randomUUID();
    const now = new Date();
    
    const [columns] = await sequelize.query(`
      SELECT column_name AS "Field"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invoices'
    `);
    const columnNames = columns.map(c => c.Field || c.column_name);
    
    console.log('Available invoice columns:', columnNames);
    
    const insertFields = [
      'id',
      '"invoiceNumber"',
      'company',
      'amount',
      'status',
      '"dueDate"',
      '"issueDate"'
    ];
    const insertValues = [
      invoiceId,
      finalInvoiceNumber,
      exhibitorInfo?.companyName || '',
      totals?.total || 0,
      'pending',
      finalDueDate,
      finalIssueDate
    ];
    
    if (columnNames.includes('exhibitorId')) {
      insertFields.push('"exhibitorId"');
      insertValues.push(exhibitorId);
    }
    
    // Add items if column exists
    if (columnNames.includes('items')) {
      insertFields.push('items');
      insertValues.push(JSON.stringify(items || []));
    }
    
    // Add notes if column exists
    if (columnNames.includes('notes')) {
      insertFields.push('notes');
      insertValues.push(notes || 'Thank you for your exhibition registration');
    }
    
    // Add metadata if column exists
    if (columnNames.includes('metadata')) {
      const metadata = {
        requirementsId,
        exhibitorInfo,
        paymentInfo,
        totals,
        generatedAt: now.toISOString(),
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        paymentStatus: 'pending'
      };
      insertFields.push('metadata');
      insertValues.push(JSON.stringify(metadata));
    }
    
    const placeholders = insertValues.map(() => '?').join(', ');
    const query = `INSERT INTO invoices (${insertFields.join(', ')}) VALUES (${placeholders})`;
    
    console.log('Executing invoice insert query');
    await sequelize.query(query, {
      replacements: insertValues
    });
    
    // Get the created invoice
    const [createdInvoice] = await sequelize.query(`
      SELECT * FROM invoices WHERE id = ?
    `, {
      replacements: [invoiceId]
    });
    
    const invoice = createdInvoice[0];
    if (invoice.metadata && typeof invoice.metadata === 'string') {
      invoice.metadata = JSON.parse(invoice.metadata);
    }
    if (invoice.items && typeof invoice.items === 'string') {
      invoice.items = JSON.parse(invoice.items);
    }
    
    console.log('✅ Invoice generated successfully:', invoiceId);
    console.log('   Status: pending (waiting for payment)');
    
    res.json({
      success: true,
      data: invoice,
      message: 'Invoice generated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error generating invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Preview print route (no authentication needed, for preview only)
router.get('/preview/print', async (req, res) => {
  try {
    const invoiceData = req.query.data ? JSON.parse(req.query.data) : {
      invoiceNumber: `PREVIEW-${Date.now()}`,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      amount: 0,
      items: [],
      metadata: {
        exhibitorInfo: {
          companyName: 'Preview Company',
          name: 'Preview User',
          email: 'preview@example.com',
          phone: 'N/A',
          gstNumber: 'N/A'
        }
      }
    };
    
    const exhibitorInfo = invoiceData.metadata?.exhibitorInfo || {};
    const items = invoiceData.items || [];
    
    let totalTaxable = 0;
    let totalGST = 0;
    let grandTotal = 0;
    
    items.forEach((item) => {
      const taxable = item.total || 0;
      const gst = taxable * 0.18;
      totalTaxable += taxable;
      totalGST += gst;
      grandTotal += taxable + gst;
    });
    
    const formatNumber = (num) => {
      return (num || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };
    
    const formatDate = (d) => {
      return new Date(d).toLocaleDateString('en-IN');
    };
    
    res.send(`<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice Preview</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Helvetica', 'Arial', sans-serif;
          background: #f0f0f0;
          padding: 40px 20px;
        }
        .invoice-container {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .invoice { padding: 40px; }
        .header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #1e3a8a;
        }
        .company-info h1 {
          color: #1e3a8a;
          font-size: 18px;
          margin-bottom: 8px;
        }
        .company-info p {
          color: #6b7280;
          font-size: 10px;
          margin: 2px 0;
        }
        .invoice-info { text-align: right; }
        .invoice-info p { font-size: 11px; margin: 4px 0; color: #374151; }
        .invoice-title { text-align: center; margin: 25px 0; }
        .invoice-title h2 { color: #1e3a8a; font-size: 24px; letter-spacing: 2px; }
        .bill-to {
          margin-bottom: 30px;
          padding: 15px;
          background: #f8fafc;
          border-left: 4px solid #1e3a8a;
        }
        .bill-to h3 { font-size: 13px; color: #1e3a8a; margin-bottom: 10px; }
        .bill-to p { font-size: 11px; margin: 4px 0; color: #374151; }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 25px 0;
          font-size: 11px;
        }
        .items-table th {
          background: #1e3a8a;
          color: white;
          padding: 10px 8px;
          text-align: left;
          font-weight: bold;
        }
        .items-table td {
          padding: 8px 8px;
          border-bottom: 1px solid #e5e7eb;
          color: #111827;
        }
        .items-table .text-right { text-align: right; }
        .totals { margin-top: 20px; text-align: right; }
        .totals-table { display: inline-block; width: 280px; }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 11px;
        }
        .totals-row.grand-total {
          font-weight: bold;
          font-size: 14px;
          color: #1e3a8a;
          border-top: 2px solid #e5e7eb;
          margin-top: 8px;
          padding-top: 8px;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e5e7eb;
        }
        .terms { font-size: 9px; color: #6b7280; }
        .terms h4 { font-size: 10px; margin-bottom: 8px; color: #374151; }
        .terms p { margin: 3px 0; }
        @media print {
          body { background: white; padding: 0; margin: 0; }
          .invoice-container { box-shadow: none; padding: 0; }
          .invoice { padding: 20px; }
          .no-print { display: none; }
          .items-table th {
            background: #1e3a8a !important;
            color: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        .print-btn { text-align: center; margin-bottom: 20px; }
        .print-btn button {
          background: #1e3a8a;
          color: white;
          border: none;
          padding: 12px 30px;
          font-size: 14px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }
        .print-btn button:hover { background: #1e40af; }
        .preview-badge {
          background: #fef3c7;
          color: #92400e;
          text-align: center;
          padding: 8px;
          font-size: 12px;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="preview-badge no-print">⚠️ PREVIEW MODE - This is not an official invoice</div>
      <div class="print-btn no-print">
        <button onclick="window.print();">🖨️ Print Preview</button>
      </div>
      
      <div class="invoice-container">
        <div class="invoice">
          <div class="header">
            <div class="company-info">
              <h1>MAXX BUSINESS MEDIA PVT. LTD.</h1>
              <p>T9, Swastik Manandi Arcade</p>
              <p>Seshadripuram, Bengaluru</p>
              <p>GSTIN: 27AAAFM1234G1Z2</p>
            </div>
            <div class="invoice-info">
              <p><strong>Invoice No:</strong> ${invoiceData.invoiceNumber}</p>
              <p><strong>Invoice Date:</strong> ${formatDate(invoiceData.issueDate)}</p>
              <p><strong>Due Date:</strong> ${formatDate(invoiceData.dueDate)}</p>
            </div>
          </div>
          
          <div class="invoice-title">
            <h2>TAX INVOICE</h2>
          </div>
          
          <div class="bill-to">
            <h3>Bill To:</h3>
            <p><strong>${exhibitorInfo.companyName || 'N/A'}</strong></p>
            <p>${exhibitorInfo.name || 'N/A'}</p>
            <p>Phone: ${exhibitorInfo.phone || 'N/A'}</p>
            <p>Email: ${exhibitorInfo.email || 'N/A'}</p>
            <p>GSTIN: ${exhibitorInfo.gstNumber || 'Not provided'}</p>
          </div>
          
          <table class="items-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Description</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Price (₹)</th>
                <th class="text-right">Taxable (₹)</th>
                <th class="text-right">CGST (9%)</th>
                <th class="text-right">SGST (9%)</th>
                <th class="text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, index) => {
                const qty = item.quantity || 1;
                const price = item.unitPrice || 0;
                const taxable = item.total || (qty * price);
                const gst = taxable * 0.18;
                const cgst = gst / 2;
                const sgst = gst / 2;
                const total = taxable + gst;
                return `
                  <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>${item.description || 'N/A'}</td>
                    <td class="text-right">${qty}</td>
                    <td class="text-right">${formatNumber(price)}</td>
                    <td class="text-right">${formatNumber(taxable)}</td>
                    <td class="text-right">${formatNumber(cgst)}</td>
                    <td class="text-right">${formatNumber(sgst)}</td>
                    <td class="text-right">${formatNumber(total)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <div class="totals-table">
              <div class="totals-row">
                <span>Total Taxable Value:</span>
                <span>₹ ${formatNumber(totalTaxable)}</span>
              </div>
              <div class="totals-row">
                <span>CGST (9%):</span>
                <span>₹ ${formatNumber(totalGST / 2)}</span>
              </div>
              <div class="totals-row">
                <span>SGST (9%):</span>
                <span>₹ ${formatNumber(totalGST / 2)}</span>
              </div>
              <div class="totals-row">
                <span>Total Tax:</span>
                <span>₹ ${formatNumber(totalGST)}</span>
              </div>
              <div class="totals-row grand-total">
                <span><strong>Grand Total:</strong></span>
                <span><strong>₹ ${formatNumber(grandTotal)}</strong></span>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div class="terms">
              <h4>Terms & Conditions:</h4>
              <p>1. Payment should be made to mentioned account.</p>
              <p>2. No refund after event starts.</p>
              <p>3. Disputes subject to jurisdiction.</p>
              <p>4. This is a computer generated invoice.</p>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>`);
    
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).send('Error generating preview');
  }
});

// Get invoice by requirements ID (for exhibitors)
router.get('/by-requirements/:requirementsId', authenticateAny, async (req, res) => {
  try {
    const { requirementsId } = req.params;
    
    const sequelize = require('../config/database').getConnection('mysql');
    
    const [invoices] = await sequelize.query(`
      SELECT * FROM invoices
      WHERE "exhibitorId" = :exhibitorId
         OR items::text ILIKE :needle
         OR notes ILIKE :needle
      ORDER BY "issueDate" DESC NULLS LAST
      LIMIT 1
    `, {
      replacements: {
        exhibitorId: req.user?.id || null,
        needle: `%${requirementsId}%`
      }
    });
    
    if (!invoices || invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found for this requirement'
      });
    }
    
    const invoice = invoices[0];
    if (invoice.metadata && typeof invoice.metadata === 'string') {
      invoice.metadata = JSON.parse(invoice.metadata);
    }
    if (invoice.items && typeof invoice.items === 'string') {
      invoice.items = JSON.parse(invoice.items);
    }
    
    res.json({
      success: true,
      data: invoice
    });
    
  } catch (error) {
    console.error('Error fetching invoice by requirements:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get my invoices (for exhibitors)
router.get('/my-invoices', authenticateAny, async (req, res) => {
  try {
    const modelFactory = require('../models');
    const Invoice = modelFactory.getModel('Invoice');
    const userId = req.user?.id;

    const invoices = userId
      ? await Invoice.findAll({
          where: { exhibitorId: userId },
          order: [['issueDate', 'DESC']]
        })
      : [];

    res.json({
      success: true,
      data: invoices
    });
    
  } catch (error) {
    console.error('Error fetching my invoices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Download invoice PDF with proper design - FIXED VERSION
router.get('/:id/download', authenticateAny, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📄 Download requested for invoice: ${id}`);
    
    const sequelize = require('../config/database').getConnection('mysql');
    
    const [invoices] = await sequelize.query(
      `SELECT * FROM invoices WHERE id = ?`,
      { replacements: [id] }
    );
    
    if (!invoices.length) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    
    const invoice = invoices[0];
    
    // Parse JSON fields
    if (invoice.items && typeof invoice.items === 'string') {
      invoice.items = JSON.parse(invoice.items);
    }
    if (invoice.metadata && typeof invoice.metadata === 'string') {
      invoice.metadata = JSON.parse(invoice.metadata);
    }
    
    const exhibitorInfo = invoice.metadata?.exhibitorInfo || {};
    const items = invoice.items || [];
    
    // Set headers BEFORE any PDF generation
    const filename = `invoice-${invoice.invoiceNumber}.pdf`;
    
    // CRITICAL: Set proper headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Disable compression for PDF
    res.setHeader('Content-Transfer-Encoding', 'binary');
    
    // Calculate totals
    let totalTaxable = 0;
    let totalGST = 0;
    let grandTotal = 0;
    
    items.forEach((item) => {
      const taxable = item.total || 0;
      const gst = taxable * 0.18;
      totalTaxable += taxable;
      totalGST += gst;
      grandTotal += taxable + gst;
    });
    
    const totalCGST = totalGST / 2;
    const totalSGST = totalGST / 2;
    
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Pipe to response
    doc.pipe(res);
    
    // Helper functions
    const formatNumber = (num) => {
      if (num === undefined || num === null) return '₹ 0.00';
      return '₹ ' + num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };
    
    const formatNumberWithoutCurrency = (num) => {
      if (num === undefined || num === null) return '0.00';
      return num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };
    
    const formatDate = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    };
    
    let y = 50;
    
    // ================= HEADER WITH LOGO =================
    try {
      const axios = require('axios');
      const imageUrl = 'https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png';
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 5000
      });
      const imageBuffer = Buffer.from(response.data, 'binary');
      doc.image(imageBuffer, 50, y, { width: 80 });
      
      doc.fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#1e3a8a')
        .text('MAXX BUSINESS MEDIA PVT. LTD.', 140, y + 10);
      
      doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#6b7280')
        .text('T9, Swastik Manandi Arcade', 140, y + 32)
        .text('Seshadripuram, Bengaluru', 140, y + 44)
        .text('GSTIN: 27AAAAM1234G1Z2', 140, y + 56);
    } catch (imgError) {
      console.error('Image load failed, using text:', imgError.message);
      doc.fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#1e3a8a')
        .text('MAXX BUSINESS MEDIA PVT. LTD.', 50, y);
      
      doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#6b7280')
        .text('T9, Swastik Manandi Arcade', 50, y + 22)
        .text('Seshadripuram, Bengaluru', 50, y + 34)
        .text('GSTIN: 27AAAAM1234G1Z2', 50, y + 46);
    }
    
    // Invoice info (right side)
    doc.fontSize(9)
      .fillColor('#374151')
      .text(`Invoice No: ${invoice.invoiceNumber}`, 350, 50, { align: 'right' })
      .text(`Invoice Date: ${formatDate(invoice.issueDate)}`, 350, 65, { align: 'right' })
      .text(`Due Date: ${formatDate(invoice.dueDate)}`, 350, 80, { align: 'right' });
    
    // Separator line
    const headerEndY = 130;
    doc.moveTo(50, headerEndY).lineTo(550, headerEndY).stroke('#e5e7eb');
    
    // ================= TITLE =================
    doc.fontSize(24)
      .font('Helvetica-Bold')
      .fillColor('#1e3a8a')
      .text('TAX INVOICE', 50, headerEndY + 30, { align: 'center', width: 500 });
    
    doc.moveTo(50, headerEndY + 55).lineTo(550, headerEndY + 55).stroke('#e5e7eb');
    
    // ================= BILL TO SECTION =================
    let currentY = headerEndY + 75;
    
    doc.fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#1e3a8a')
      .text('Bill To:', 50, currentY);
    
    currentY += 20;
    
    doc.fontSize(10)
      .font('Helvetica')
      .fillColor('#374151');
    
    doc.text(exhibitorInfo.companyName || invoice.company || 'N/A', 50, currentY);
    currentY += 16;
    doc.text(exhibitorInfo.name || 'N/A', 50, currentY);
    currentY += 16;
    doc.text(`Phone: ${exhibitorInfo.phone || 'N/A'}`, 50, currentY);
    currentY += 16;
    doc.text(`Email: ${exhibitorInfo.email || 'N/A'}`, 50, currentY);
    currentY += 16;
    doc.text(`GSTIN: ${exhibitorInfo.gstNumber || 'Not provided'}`, 50, currentY);
    
    // ================= TABLE =================
    let tableY = currentY + 30;
    
    // Table header background
    doc.rect(50, tableY, 500, 25).fill('#e0f2fe');
    
    // Table headers
    doc.fillColor('#1e3a8a')
      .font('Helvetica-Bold')
      .fontSize(9);
    
    doc.text('S.No', 55, tableY + 8);
    doc.text('Description', 90, tableY + 8);
    doc.text('Qty', 320, tableY + 8, { width: 40, align: 'center' });
    doc.text('Price (₹)', 360, tableY + 8, { width: 60, align: 'right' });
    doc.text('Taxable (₹)', 420, tableY + 8, { width: 60, align: 'right' });
    doc.text('GST (₹)', 475, tableY + 8, { width: 55, align: 'right' });
    doc.text('Amount (₹)', 525, tableY + 8, { width: 60, align: 'right' });
    
    tableY += 25;
    
    // Table rows
    doc.font('Helvetica')
      .fillColor('#111827')
      .fontSize(9);
    
    items.forEach((item, index) => {
      const yPos = tableY + index * 20;
      const qty = item.quantity || 1;
      const price = item.unitPrice || 0;
      const taxable = item.total || (qty * price);
      const gst = taxable * 0.18;
      const total = taxable + gst;
      
      doc.text((index + 1).toString(), 55, yPos);
      doc.text(item.description || 'N/A', 90, yPos, { width: 220 });
      doc.text(qty.toString(), 320, yPos, { width: 40, align: 'center' });
      doc.text(formatNumberWithoutCurrency(price), 360, yPos, { width: 60, align: 'right' });
      doc.text(formatNumberWithoutCurrency(taxable), 420, yPos, { width: 60, align: 'right' });
      doc.text(formatNumberWithoutCurrency(gst), 475, yPos, { width: 55, align: 'right' });
      doc.text(formatNumberWithoutCurrency(total), 525, yPos, { width: 60, align: 'right' });
    });
    
    // ================= TOTALS SECTION =================
    let totalsY = tableY + items.length * 20 + 20;
    
    doc.fontSize(9)
      .font('Helvetica')
      .fillColor('#374151');
    
    const totalsX = 380;
    
    doc.text('Total Taxable Value:', totalsX, totalsY);
    doc.text(formatNumber(totalTaxable), 520, totalsY, { align: 'right' });
    
    totalsY += 18;
    
    doc.text('CGST (9%):', totalsX, totalsY);
    doc.text(formatNumber(totalCGST), 520, totalsY, { align: 'right' });
    
    totalsY += 18;
    
    doc.text('SGST (9%):', totalsX, totalsY);
    doc.text(formatNumber(totalSGST), 520, totalsY, { align: 'right' });
    
    totalsY += 18;
    
    doc.text('Total Tax:', totalsX, totalsY);
    doc.text(formatNumber(totalGST), 520, totalsY, { align: 'right' });
    
    totalsY += 25;
    
    // Grand Total
    doc.font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#1e3a8a');
    
    doc.text('Grand Total:', totalsX, totalsY);
    doc.text(formatNumber(grandTotal), 520, totalsY, { align: 'right' });
    
    // ================= FOOTER / TERMS =================
    let termsY = totalsY + 50;
    
    doc.fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#374151')
      .text('Terms & Conditions:', 50, termsY);
    
    termsY += 18;
    
    doc.fontSize(8)
      .font('Helvetica')
      .fillColor('#6b7280');
    
    const terms = [
      '1. Payment should be made to mentioned account.',
      '2. No refund after event starts.',
      '3. Disputes subject to jurisdiction.',
      '4. This is a computer generated invoice.'
    ];
    
    terms.forEach((term) => {
      doc.text(term, 50, termsY);
      termsY += 14;
    });
    
    // Footer line
    doc.moveTo(50, termsY + 10).lineTo(550, termsY + 10).stroke('#e5e7eb');
    
    doc.fontSize(7)
      .fillColor('#9ca3af')
      .text('Thank you for your business!', 50, termsY + 20, { align: 'center', width: 500 });
    
    // End the document
    doc.end();
    
    console.log(`✅ PDF generated and sent for invoice: ${invoice.invoiceNumber}`);
    
  } catch (error) {
    console.error('PDF Generation Error:', error);
    // Only send error response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to generate PDF'
      });
    }
  }
});

// Get invoice with details (for exhibitors)
router.get('/:id/details', authenticateAny, async (req, res) => {
  try {
    const { id } = req.params;
    
    const sequelize = require('../config/database').getConnection('mysql');
    
    const [invoices] = await sequelize.query(`
      SELECT * FROM invoices WHERE id = ?
    `, {
      replacements: [id]
    });
    
    if (!invoices || invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    const invoice = invoices[0];
    
    if (invoice.items && typeof invoice.items === 'string') {
      invoice.items = JSON.parse(invoice.items);
    }
    if (invoice.metadata && typeof invoice.metadata === 'string') {
      invoice.metadata = JSON.parse(invoice.metadata);
    }
    
    let requirementData = null;
    if (invoice.metadata?.requirementsId) {
      const [requirements] = await sequelize.query(`
        SELECT * FROM requirements WHERE id = ?
      `, {
        replacements: [invoice.metadata.requirementsId]
      });
      
      if (requirements && requirements.length > 0) {
        const req = requirements[0];
        if (req.data && typeof req.data === 'string') {
          requirementData = JSON.parse(req.data);
        } else {
          requirementData = req.data;
        }
      }
    }
    
    const fullData = {
      ...invoice,
      exhibitorDetails: invoice.metadata?.exhibitorInfo || requirementData?.generalInfo || {},
      boothDetails: requirementData?.boothDetails || {},
      services: invoice.items || [],
      paymentDetails: invoice.metadata?.paymentInfo || requirementData?.paymentDetails || {},
      totals: invoice.metadata?.totals || {
        servicesTotal: invoice.amount,
        gst: invoice.amount * 0.18,
        total: invoice.amount
      }
    };
    
    res.json({
      success: true,
      data: fullData
    });
    
  } catch (error) {
    console.error('Error fetching invoice with details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all invoices (admin) — registered before /:id so "admin" is not treated as an invoice id
router.get('/admin/all', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const sequelize = require('../config/database').getConnection('mysql');
    const { status, search } = req.query;

    const where = [];
    const replacements = {};

    if (status && status !== 'all') {
      where.push('i.status = :status');
      replacements.status = status;
    }
    if (search) {
      where.push('(i."invoiceNumber" ILIKE :search OR i.company ILIKE :search OR e.company ILIKE :search OR e.name ILIKE :search)');
      replacements.search = `%${search}%`;
    }

    const [invoices] = await sequelize.query(`
      SELECT
        i.id,
        i."invoiceNumber",
        i."exhibitorId",
        COALESCE(i.company, e.company) AS company,
        i.amount,
        i.status,
        i."dueDate",
        i."issueDate",
        i."paidDate",
        i.items,
        i.notes,
        i.terms,
        e.name AS exhibitor_name,
        e.email AS exhibitor_email
      FROM invoices i
      LEFT JOIN exhibitors e ON e.id = i."exhibitorId"
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY i."issueDate" DESC NULLS LAST
    `, { replacements });

    const data = invoices.map((invoice) => {
      const items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : invoice.items;
      return {
        ...invoice,
        items,
        company: invoice.company || '—',
        metadata: {
          exhibitorInfo: {
            name: invoice.exhibitor_name,
            companyName: invoice.company,
            email: invoice.exhibitor_email
          }
        }
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching all invoices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single invoice (for exhibitors)
router.get('/:id', authenticateAny, async (req, res) => {
  try {
    const { id } = req.params;
    
    const sequelize = require('../config/database').getConnection('mysql');
    
    const [invoices] = await sequelize.query(`
      SELECT * FROM invoices WHERE id = ?
    `, {
      replacements: [id]
    });
    
    if (!invoices || invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    const invoice = invoices[0];
    
    if (invoice.items && typeof invoice.items === 'string') {
      invoice.items = JSON.parse(invoice.items);
    }
    if (invoice.metadata && typeof invoice.metadata === 'string') {
      invoice.metadata = JSON.parse(invoice.metadata);
    }
    
    res.json({
      success: true,
      data: invoice
    });
    
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Print-friendly HTML invoice page (same design as your image)
router.get('/:id/print', async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    
    // Verify token (same as before)
    let user = null;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const modelFactory = require('../models');
        
        if (decoded.role === 'exhibitor') {
          const Exhibitor = modelFactory.getModel('Exhibitor');
          user = await Exhibitor.findByPk(decoded.id);
        } else {
          const User = modelFactory.getModel('User');
          user = await User.findByPk(decoded.id);
        }
      } catch (err) {
        console.log('Invalid token for print:', err.message);
      }
    }
    
    const sequelize = require('../config/database').getConnection('mysql');
    
    const [invoices] = await sequelize.query(`
      SELECT * FROM invoices WHERE id = ?
    `, {
      replacements: [id]
    });
    
    if (!invoices || invoices.length === 0) {
      return res.status(404).send('Invoice not found');
    }
    
    const invoice = invoices[0];
    
    if (invoice.items && typeof invoice.items === 'string') {
      invoice.items = JSON.parse(invoice.items);
    }
    if (invoice.metadata && typeof invoice.metadata === 'string') {
      invoice.metadata = JSON.parse(invoice.metadata);
    }
    
    const exhibitorInfo = invoice.metadata?.exhibitorInfo || {};
    const items = invoice.items || [];
    
    let totalTaxable = 0;
    let totalGST = 0;
    let grandTotal = 0;
    
    items.forEach((item) => {
      const taxable = item.total || 0;
      const gst = taxable * 0.18;
      totalTaxable += taxable;
      totalGST += gst;
      grandTotal += taxable + gst;
    });
    
    const formatNumber = (num) => {
      return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(num || 0);
    };
    
    const formatCurrency = (num) => {
      return `₹ ${formatNumber(num)}`;
    };
    
    const formatDate = (d) => {
      const date = new Date(d);
      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    };
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Invoice ${invoice.invoiceNumber}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            background: #f0f0f0;
            padding: 40px 20px;
          }
          
          .invoice-container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          
          .invoice {
            padding: 40px;
          }
          
          .header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #1e3a8a;
          }
          
          .logo-section {
            display: flex;
            align-items: flex-start;
            gap: 15px;
          }
          
          .company-logo {
            width: 80px;
            height: auto;
          }
          
          .company-info h1 {
            color: #1e3a8a;
            font-size: 18px;
            margin-bottom: 8px;
          }
          
          .company-info p {
            color: #6b7280;
            font-size: 10px;
            margin: 2px 0;
          }
          
          .invoice-info {
            text-align: right;
          }
          
          .invoice-info p {
            font-size: 11px;
            margin: 4px 0;
            color: #374151;
          }
          
          .invoice-title {
            text-align: center;
            margin: 25px 0;
          }
          
          .invoice-title h2 {
            color: #1e3a8a;
            font-size: 24px;
            letter-spacing: 2px;
          }
          
          .bill-to {
            margin-bottom: 30px;
            padding: 15px;
            background: #f8fafc;
            border-left: 4px solid #1e3a8a;
          }
          
          .bill-to h3 {
            font-size: 13px;
            color: #1e3a8a;
            margin-bottom: 10px;
          }
          
          .bill-to p {
            font-size: 11px;
            margin: 4px 0;
            color: #374151;
          }
          
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 25px 0;
            font-size: 11px;
          }
          
          .items-table th {
            background: #e0f2fe;
            color: #1e3a8a;
            padding: 10px 8px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #cbd5e1;
          }
          
          .items-table td {
            padding: 8px 8px;
            border: 1px solid #e5e7eb;
            color: #111827;
          }
          
          .items-table .text-right {
            text-align: right;
          }
          
          .items-table .text-center {
            text-align: center;
          }
          
          .totals {
            margin-top: 20px;
            text-align: right;
          }
          
          .totals-table {
            display: inline-block;
            width: 280px;
          }
          
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 11px;
          }
          
          .totals-row.grand-total {
            font-weight: bold;
            font-size: 14px;
            color: #1e3a8a;
            border-top: 2px solid #e5e7eb;
            margin-top: 8px;
            padding-top: 8px;
          }
          
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e5e7eb;
          }
          
          .terms {
            font-size: 9px;
            color: #6b7280;
          }
          
          .terms h4 {
            font-size: 10px;
            margin-bottom: 8px;
            color: #374151;
          }
          
          .terms p {
            margin: 3px 0;
          }
          
          @media print {
            body {
              background: white;
              padding: 0;
              margin: 0;
            }
            .invoice-container {
              box-shadow: none;
              padding: 0;
            }
            .invoice {
              padding: 20px;
            }
            .no-print {
              display: none;
            }
            .items-table th {
              background: #e0f2fe !important;
              color: #1e3a8a !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          
          .print-btn {
            text-align: center;
            margin-bottom: 20px;
          }
          
          .print-btn button {
            background: #1e3a8a;
            color: white;
            border: none;
            padding: 12px 30px;
            font-size: 14px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          }
          
          .print-btn button:hover {
            background: #1e40af;
          }
        </style>
      </head>
      <body>
        <div class="print-btn no-print">
          <button onclick="window.print();">🖨️ Print Invoice</button>
        </div>
        
        <div class="invoice-container">
          <div class="invoice">
            <div class="header">
              <div class="logo-section">
                <img src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1774687173/maxxlogo_lulkwh.png" alt="Logo" class="company-logo" style="width: 80px; height: auto;">
                <div class="company-info">
                  <h1>MAXX BUSINESS MEDIA PVT. LTD.</h1>
                  <p>T9, Swastik Manandi Arcade</p>
                  <p>Seshadripuram, Bengaluru</p>
                  <p>GSTIN: 27AAAAM1234G1Z2</p>
                </div>
              </div>
              <div class="invoice-info">
                <p><strong>Invoice No:</strong> ${invoice.invoiceNumber}</p>
                <p><strong>Invoice Date:</strong> ${formatDate(invoice.issueDate)}</p>
                <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>
              </div>
            </div>
            
            <div class="invoice-title">
              <h2>TAX INVOICE</h2>
            </div>
            
            <div class="bill-to">
              <h3>Bill To:</h3>
              <p><strong>${exhibitorInfo.companyName || invoice.company || 'N/A'}</strong></p>
              <p>${exhibitorInfo.name || 'N/A'}</p>
              <p>Phone: ${exhibitorInfo.phone || 'N/A'}</p>
              <p>Email: ${exhibitorInfo.email || 'N/A'}</p>
              <p>GSTIN: ${exhibitorInfo.gstNumber || 'Not provided'}</p>
            </div>
            
            <table class="items-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Description</th>
                  <th class="text-center">Qty</th>
                  <th class="text-right">Price (₹)</th>
                  <th class="text-right">Taxable (₹)</th>
                  <th class="text-right">GST (₹)</th>
                  <th class="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, index) => {
                  const qty = item.quantity || 1;
                  const price = item.unitPrice || 0;
                  const taxable = item.total || (qty * price);
                  const gst = taxable * 0.18;
                  const total = taxable + gst;
                  return `
                    <tr>
                      <td class="text-center">${index + 1}</td>
                      <td>${item.description || 'N/A'}</td>
                      <td class="text-center">${qty}</td>
                      <td class="text-right">${formatCurrency(price)}</td>
                      <td class="text-right">${formatCurrency(taxable)}</td>
                      <td class="text-right">${formatCurrency(gst)}</td>
                      <td class="text-right">${formatCurrency(total)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            
            <div class="totals">
              <div class="totals-table">
                <div class="totals-row">
                  <span>Total Taxable Value:</span>
                  <span>${formatCurrency(totalTaxable)}</span>
                </div>
                <div class="totals-row">
                  <span>CGST (9%):</span>
                  <span>${formatCurrency(totalGST / 2)}</span>
                </div>
                <div class="totals-row">
                  <span>SGST (9%):</span>
                  <span>${formatCurrency(totalGST / 2)}</span>
                </div>
                <div class="totals-row">
                  <span>Total Tax:</span>
                  <span>${formatCurrency(totalGST)}</span>
                </div>
                <div class="totals-row grand-total">
                  <span><strong>Grand Total:</strong></span>
                  <span><strong>${formatCurrency(grandTotal)}</strong></span>
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="terms">
                <h4>Terms & Conditions:</h4>
                <p>1. Payment should be made to mentioned account.</p>
                <p>2. No refund after event starts.</p>
                <p>3. Disputes subject to jurisdiction.</p>
                <p>4. This is a computer generated invoice.</p>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Error generating print view:', error);
    res.status(500).send('Error generating invoice view: ' + error.message);
  }
});

// Send invoice email (for exhibitors)
router.post('/:id/send-email', authenticateAny, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }
    
    const sequelize = require('../config/database').getConnection('mysql');
    
    const [invoices] = await sequelize.query(`
      SELECT * FROM invoices WHERE id = ?
    `, {
      replacements: [id]
    });
    
    if (!invoices || invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    const invoice = invoices[0];
    if (invoice.metadata && typeof invoice.metadata === 'string') {
      invoice.metadata = JSON.parse(invoice.metadata);
    }
    
    res.json({
      success: true,
      message: `Email would be sent to ${email}`,
      data: {
        to: email,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount
      }
    });
    
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// Update invoice status (admin)
router.put('/admin/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    console.log('📝 Admin update request:', { id, status });
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }
    
    // Validate status
    const validStatuses = ['pending', 'paid', 'overdue', 'draft', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const sequelize = require('../config/database').getConnection('mysql');
    
    if (!sequelize) {
      console.error('❌ Database connection not found');
      return res.status(500).json({
        success: false,
        error: 'Database connection error'
      });
    }
    
    // First check column names in the database
    const [columns] = await sequelize.query(`
      SELECT column_name AS "Field"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invoices'
    `);
    const columnNames = columns.map(c => c.Field || c.column_name);
    console.log('Available columns:', columnNames);
    
    // Check if invoice exists
    const [existingInvoices] = await sequelize.query(
      'SELECT * FROM invoices WHERE id = ?',
      { replacements: [id] }
    );
    
    if (!existingInvoices || existingInvoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    const currentInvoice = existingInvoices[0];
    const now = new Date();
    
    // Safely parse metadata if column exists
    let metadata = {};
    if (columnNames.includes('metadata') && currentInvoice.metadata) {
      try {
        metadata = typeof currentInvoice.metadata === 'string' 
          ? JSON.parse(currentInvoice.metadata) 
          : currentInvoice.metadata;
      } catch (parseError) {
        console.warn('Could not parse metadata:', parseError.message);
        metadata = {};
      }
    }
    
    // Initialize statusHistory if needed
    if (!metadata.statusHistory) {
      metadata.statusHistory = [];
    }
    
    // Add status change record
    metadata.statusHistory.push({
      from: currentInvoice.status,
      to: status,
      changedBy: req.user?.id || 'admin',
      changedAt: now.toISOString(),
      notes: notes || ''
    });
    
    // Build update query based on available columns
    const updateFields = [];
    const updateValues = [];
    
    // Always update these
    updateFields.push('status = ?');
    updateValues.push(status);
    
    updateFields.push('notes = ?');
    updateValues.push(notes || currentInvoice.notes || null);
    
    updateFields.push('updated_at = ?');
    updateValues.push(now);
    
    // Update metadata if column exists
    if (columnNames.includes('metadata')) {
      updateFields.push('metadata = ?');
      updateValues.push(JSON.stringify(metadata));
    }
    
    // Update paid_at OR paidDate based on what column exists
    if (columnNames.includes('paid_at')) {
      let paidAt = currentInvoice.paid_at;
      if (status === 'paid' && !paidAt) {
        paidAt = now;
      } else if (status !== 'paid') {
        paidAt = null;
      }
      updateFields.push('paid_at = ?');
      updateValues.push(paidAt);
    } else if (columnNames.includes('paidDate')) {
      let paidDate = currentInvoice.paidDate;
      if (status === 'paid' && !paidDate) {
        paidDate = now;
      } else if (status !== 'paid') {
        paidDate = null;
      }
      updateFields.push('paidDate = ?');
      updateValues.push(paidDate);
    }
    
    updateValues.push(id);
    
    const query = `
      UPDATE invoices 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `;
    
    console.log('Executing update query with fields:', updateFields);
    
    await sequelize.query(query, { replacements: updateValues });
    
    // Fetch updated invoice
    const [updatedInvoices] = await sequelize.query(
      'SELECT * FROM invoices WHERE id = ?',
      { replacements: [id] }
    );
    
    if (!updatedInvoices || updatedInvoices.length === 0) {
      throw new Error('Failed to fetch updated invoice');
    }
    
    let invoice = updatedInvoices[0];
    
    // Safely parse JSON fields for response
    if (invoice.metadata && typeof invoice.metadata === 'string') {
      try {
        invoice.metadata = JSON.parse(invoice.metadata);
      } catch (e) {
        invoice.metadata = {};
      }
    }
    if (invoice.items && typeof invoice.items === 'string') {
      try {
        invoice.items = JSON.parse(invoice.items);
      } catch (e) {
        invoice.items = [];
      }
    }
    
    console.log(`✅ Invoice ${invoice.invoiceNumber} updated from ${currentInvoice.status} to ${status}`);
    
    res.json({
      success: true,
      data: invoice,
      message: 'Invoice updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating invoice:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
});
// Get invoice stats (admin)
router.get('/admin/stats', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const sequelize = require('../config/database').getConnection('mysql');
    
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
        SUM(amount) as totalAmount,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paidAmount,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pendingAmount
      FROM invoices
    `);
    
    res.json({
      success: true,
      data: stats[0]
    });
    
  } catch (error) {
    console.error('Error fetching invoice stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;