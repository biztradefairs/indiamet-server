// src/services/InvoiceService.js
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../models');

class InvoiceService {
async createInvoice(data) {
  try {
    const invoiceNumber = data.invoiceNumber || `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    
    // Ensure all required fields are present
    const invoiceData = {
      id: uuidv4(),
      invoiceNumber,
      exhibitorId: data.exhibitorId,
      company: data.exhibitorInfo?.companyName || 'N/A',
      amount: data.totals?.total || 0,
      status: 'pending',
      dueDate: data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      issueDate: data.issueDate || new Date(),
      items: data.items || [],
      notes: data.notes,
      metadata: {
        requirementsId: data.requirementsId,
        exhibitorInfo: data.exhibitorInfo,
        paymentInfo: data.paymentInfo,
        totals: data.totals
      }
    };
    
    const invoice = await db.Invoice.create(invoiceData);
    return invoice;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

// Add to src/services/InvoiceService.js

async getInvoiceByRequirementsId(requirementsId) {
  try {
    const invoice = await db.Invoice.findOne({
      where: {
        'metadata.requirementsId': requirementsId
      }
    });
    return invoice;
  } catch (error) {
    console.error('Error finding invoice by requirements ID:', error);
    return null;
  }
}

async createInvoice(data) {
  try {
    const invoiceNumber = data.invoiceNumber || `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    
    // Ensure all required fields are present
    const invoiceData = {
      id: uuidv4(),
      invoiceNumber,
      exhibitorId: data.exhibitorId,
      company: data.exhibitorInfo?.companyName || 'N/A',
      amount: data.totals?.total || 0,
      status: 'pending',
      dueDate: data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      issueDate: data.issueDate || new Date(),
      items: data.items || [],
      notes: data.notes,
      metadata: {
        requirementsId: data.requirementsId,
        exhibitorInfo: data.exhibitorInfo,
        paymentInfo: data.paymentInfo,
        totals: data.totals
      }
    };
    
    const invoice = await db.Invoice.create(invoiceData);
    return invoice;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

async generateInvoicePdf(invoiceId) {
  const invoice = await this.getInvoiceById(invoiceId);
  const metadata = invoice.metadata || {};
  const exhibitorInfo = metadata.exhibitorInfo || {};
  const items = invoice.items || [];
  const totals = metadata.totals || {};
  
  // Create PDF
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks = [];
  
  doc.on('data', chunk => chunks.push(chunk));
  
  // Header
  doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).font('Helvetica');
  doc.text(`Invoice Number: ${invoice.invoiceNumber}`, { align: 'right' });
  doc.text(`Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, { align: 'right' });
  doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, { align: 'right' });
  doc.text(`Status: ${invoice.status.toUpperCase()}`, { align: 'right' });
  doc.moveDown(2);
  
  // Bill To
  doc.fontSize(12).font('Helvetica-Bold').text('Bill To:');
  doc.fontSize(10).font('Helvetica');
  doc.text(exhibitorInfo.companyName || 'N/A');
  doc.text(exhibitorInfo.name || 'N/A');
  doc.text(exhibitorInfo.address || 'N/A');
  doc.text(`Email: ${exhibitorInfo.email || 'N/A'}`);
  doc.text(`Phone: ${exhibitorInfo.phone || 'N/A'}`);
  doc.text(`GST: ${exhibitorInfo.gstNumber || 'N/A'}`);
  doc.text(`Booth: ${exhibitorInfo.boothNumber || 'N/A'}`);
  doc.moveDown();
  
  // Items Table
  const tableTop = doc.y;
  const startX = 50;
  const colWidths = {
    desc: 250,
    qty: 60,
    price: 80,
    total: 80
  };
  
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Description', startX, tableTop);
  doc.text('Qty', startX + colWidths.desc, tableTop);
  doc.text('Unit Price (₹)', startX + colWidths.desc + colWidths.qty, tableTop);
  doc.text('Total (₹)', startX + colWidths.desc + colWidths.qty + colWidths.price, tableTop);
  
  doc.moveDown();
  doc.font('Helvetica');
  
  let y = doc.y;
  items.forEach(item => {
    doc.text(item.description.substring(0, 50), startX, y);
    doc.text(item.quantity.toString(), startX + colWidths.desc, y);
    doc.text(item.unitPrice.toLocaleString(), startX + colWidths.desc + colWidths.qty, y);
    doc.text(item.total.toLocaleString(), startX + colWidths.desc + colWidths.qty + colWidths.price, y);
    y += 20;
    
    // Check if we need a new page
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
  });
  
  // Totals
  y = Math.max(y + 20, tableTop + 150);
  const subtotal = totals.subtotal || invoice.amount;
  const gst = totals.gst || subtotal * 0.18;
  const total = totals.total || subtotal + gst;
  
  doc.font('Helvetica-Bold');
  doc.text('Subtotal:', startX + colWidths.desc + colWidths.qty + colWidths.price, y);
  doc.text(`₹${subtotal.toLocaleString()}`, startX + colWidths.desc + colWidths.qty + colWidths.price + colWidths.total, y);
  y += 20;
  doc.text('GST (18%):', startX + colWidths.desc + colWidths.qty + colWidths.price, y);
  doc.text(`₹${gst.toLocaleString()}`, startX + colWidths.desc + colWidths.qty + colWidths.price + colWidths.total, y);
  y += 25;
  doc.fontSize(12);
  doc.text('Total Amount:', startX + colWidths.desc + colWidths.qty + colWidths.price, y);
  doc.text(`₹${total.toLocaleString()}`, startX + colWidths.desc + colWidths.qty + colWidths.price + colWidths.total, y);
  
  // Payment Info
  if (metadata.paymentInfo && Object.keys(metadata.paymentInfo).length > 0) {
    doc.moveDown(2);
    doc.fontSize(12).font('Helvetica-Bold').text('Payment Details:');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Transaction ID: ${metadata.paymentInfo.transactionId || 'N/A'}`);
    doc.text(`Payment Mode: ${metadata.paymentInfo.paymentMode || 'N/A'}`);
    doc.text(`Payment Date: ${metadata.paymentInfo.paymentDate || 'N/A'}`);
    doc.text(`Bank: ${metadata.paymentInfo.bankName || 'N/A'}`);
  }
  
  // Notes
  if (invoice.notes) {
    doc.moveDown(2);
    doc.fontSize(12).font('Helvetica-Bold').text('Notes:');
    doc.fontSize(10).font('Helvetica');
    doc.text(invoice.notes);
  }
  
  // Footer
  doc.moveDown(3);
  doc.fontSize(8).font('Helvetica')
    .text('Thank you for your business!', { align: 'center' })
    .text('For queries, contact accounts@maxxexhibition.com', { align: 'center' });
  
  doc.end();
  
  return new Promise((resolve) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
  
  async getInvoicesByExhibitor(exhibitorId) {
    return await db.Invoice.findAll({
      where: { exhibitorId },
      order: [['issueDate', 'DESC']]
    });
  }
  
  async getInvoiceById(invoiceId) {
    const invoice = await db.Invoice.findByPk(invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    return invoice;
  }
  
  async updateInvoiceStatus(invoiceId, status, notes = null) {
    const invoice = await this.getInvoiceById(invoiceId);
    const updateData = { status };
    
    if (status === 'paid') {
      updateData.paidDate = new Date();
    }
    
    if (notes) {
      updateData.notes = notes;
    }
    
    await invoice.update(updateData);
    return invoice;
  }
  
  async generateInvoicePdf(invoiceId) {
    const invoice = await this.getInvoiceById(invoiceId);
    const metadata = invoice.metadata || {};
    const exhibitorInfo = metadata.exhibitorInfo || {};
    const items = invoice.items || [];
    
    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {});
    
    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Invoice Number: ${invoice.invoiceNumber}`, { align: 'right' });
    doc.text(`Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, { align: 'right' });
    doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, { align: 'right' });
    doc.text(`Status: ${invoice.status.toUpperCase()}`, { align: 'right' });
    doc.moveDown(2);
    
    // Bill To
    doc.fontSize(12).font('Helvetica-Bold').text('Bill To:');
    doc.fontSize(10).font('Helvetica');
    doc.text(exhibitorInfo.companyName || 'N/A');
    doc.text(exhibitorInfo.name || 'N/A');
    doc.text(exhibitorInfo.address || 'N/A');
    doc.text(`Email: ${exhibitorInfo.email || 'N/A'}`);
    doc.text(`Phone: ${exhibitorInfo.phone || 'N/A'}`);
    doc.text(`GST: ${exhibitorInfo.gstNumber || 'N/A'}`);
    doc.text(`Booth: ${exhibitorInfo.boothNumber || 'N/A'}`);
    doc.moveDown();
    
    // Items Table
    const tableTop = doc.y;
    const itemColX = 50;
    const descColX = 50;
    const qtyColX = 300;
    const priceColX = 380;
    const totalColX = 460;
    
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Description', descColX, tableTop);
    doc.text('Qty', qtyColX, tableTop);
    doc.text('Unit Price (₹)', priceColX, tableTop);
    doc.text('Total (₹)', totalColX, tableTop);
    
    doc.moveDown();
    doc.font('Helvetica');
    
    let y = doc.y;
    items.forEach(item => {
      doc.text(item.description, descColX, y);
      doc.text(item.quantity.toString(), qtyColX, y);
      doc.text(item.unitPrice.toLocaleString(), priceColX, y);
      doc.text(item.total.toLocaleString(), totalColX, y);
      y += 20;
    });
    
    doc.moveDown();
    y = doc.y;
    
    // Totals
    const subtotal = invoice.amount;
    const gst = subtotal * 0.18;
    const total = subtotal + gst;
    
    doc.font('Helvetica-Bold');
    doc.text('Subtotal:', priceColX, y);
    doc.text(`₹${subtotal.toLocaleString()}`, totalColX, y);
    y += 20;
    doc.text('GST (18%):', priceColX, y);
    doc.text(`₹${gst.toLocaleString()}`, totalColX, y);
    y += 25;
    doc.fontSize(12);
    doc.text('Total Amount:', priceColX, y);
    doc.text(`₹${total.toLocaleString()}`, totalColX, y);
    
    // Payment Info
    if (metadata.paymentInfo) {
      doc.moveDown(2);
      doc.fontSize(12).font('Helvetica-Bold').text('Payment Details:');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Transaction ID: ${metadata.paymentInfo.transactionId || 'N/A'}`);
      doc.text(`Payment Mode: ${metadata.paymentInfo.paymentMode || 'N/A'}`);
      doc.text(`Payment Date: ${metadata.paymentInfo.paymentDate || 'N/A'}`);
      doc.text(`Bank: ${metadata.paymentInfo.bankName || 'N/A'}`);
    }
    
    // Notes
    if (invoice.notes) {
      doc.moveDown(2);
      doc.fontSize(12).font('Helvetica-Bold').text('Notes:');
      doc.fontSize(10).font('Helvetica');
      doc.text(invoice.notes);
    }
    
    // Footer
    doc.moveDown(3);
    doc.fontSize(8).font('Helvetica')
      .text('Thank you for your business!', { align: 'center' })
      .text('For queries, contact accounts@maxxexhibition.com', { align: 'center' });
    
    doc.end();
    
    return new Promise((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }
  
  async getAllInvoices(filters, page = 1, limit = 10) {
    const where = {};
    
    if (filters.search) {
      where[db.Sequelize.Op.or] = [
        { invoiceNumber: { [db.Sequelize.Op.like]: `%${filters.search}%` } },
        { company: { [db.Sequelize.Op.like]: `%${filters.search}%` } }
      ];
    }
    
    if (filters.status) {
      where.status = filters.status;
    }
    
    const offset = (page - 1) * limit;
    
    const { count, rows } = await db.getModel('Invoice').findAndCountAll({
      where,
      limit,
      offset,
      order: [['issueDate', 'DESC']]
    });
    
    return {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      data: rows
    };
  }
  
  async getInvoiceStats() {
    const stats = await db.Invoice.findAll({
      attributes: [
        'status',
        [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count'],
        [db.Sequelize.fn('SUM', db.Sequelize.col('amount')), 'totalAmount']
      ],
      group: ['status']
    });
    
    const totalAmount = await db.Invoice.sum('amount');
    
    return {
      totalAmount: totalAmount || 0,
      byStatus: stats
    };
  }
}

module.exports = new InvoiceService();