const { Op, Sequelize } = require('sequelize');

class PaymentService {
  constructor() {
    this.dbType = process.env.DB_TYPE || 'postgres';
    this.initialized = false;
    this._paymentModel = null;
    this._invoiceModel = null;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    
    console.log('🔧 PaymentService: Initializing...');
    
    try {
      // Initialize model factory
      const modelFactory = require('../models');
      
      // Ensure models are initialized
      if (modelFactory.getModel('Payment') === undefined) {
        console.log('⚠️ Models not initialized, initializing now...');
        await modelFactory.init();
      }
      
      // Get models
      this._paymentModel = modelFactory.getModel('Payment');
      this._invoiceModel = modelFactory.getModel('Invoice');

      if (!this._paymentModel) {
        throw new Error('Payment model not found');
      }

      try {
        await this._paymentModel.sync();
      } catch (syncError) {
        console.warn('⚠️ Payment table sync warning:', syncError.message);
      }
      
      this.initialized = true;
      console.log('✅ PaymentService: Initialized successfully');
    } catch (error) {
      console.error('❌ PaymentService: Initialization failed:', error);
      throw error;
    }
  }

  get Payment() {
    if (!this._paymentModel) {
      throw new Error('Payment model not initialized. Call ensureInitialized() first.');
    }
    return this._paymentModel;
  }

  get Invoice() {
    if (!this._invoiceModel) {
      throw new Error('Invoice model not initialized.');
    }
    return this._invoiceModel;
  }

  async createPayment(paymentData) {
    await this.ensureInitialized();
    
    try {
      console.log('💳 Creating payment...');
      
      if (!paymentData.transactionId) {
        paymentData.transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }

      // Use Sequelize method
      const payment = await this.Payment.create(paymentData);
      console.log(`✅ Payment created with ID: ${payment.id}`);
      
      // Try Kafka notifications
      try {
        const kafkaProducer = require('../kafka/producer');
        await kafkaProducer.sendNotification('PAYMENT_RECEIVED', payment.userId, {
          paymentId: payment.id,
          amount: payment.amount,
          status: payment.status
        });
      } catch (kafkaError) {
        console.warn('⚠️ Kafka not available for notification');
      }

      return payment;
    } catch (error) {
      console.error('❌ Error creating payment:', error);
      throw new Error(`Failed to create payment: ${error.message}`);
    }
  }

  async getAllPayments(filters = {}, page = 1, limit = 10) {
    await this.ensureInitialized();
    
    try {
      console.log('📋 Fetching all payments...');
      const offset = (page - 1) * limit;
      
      let where = {};
      
      // Search filter
      if (filters.search) {
        where[Op.or] = [
          { invoiceNumber: { [Op.like]: `%${filters.search}%` } },
          { transactionId: { [Op.like]: `%${filters.search}%` } }
        ];
      }
      
      // Status filter
      if (filters.status && filters.status !== 'all') {
        where.status = filters.status;
      }
      
      // Method filter
      if (filters.method && filters.method !== 'all') {
        where.method = filters.method;
      }

      if (filters.exhibitorId) {
        where.exhibitorId = filters.exhibitorId;
      }
      
      // Date range filter
      if (filters.startDate && filters.endDate) {
        where.date = {
          [Op.between]: [new Date(filters.startDate), new Date(filters.endDate)]
        };
      }

      // Use Sequelize's findAndCountAll method
      const result = await this.Payment.findAndCountAll({
        where,
        limit,
        offset,
        order: [['date', 'DESC']]
      });
      
      console.log(`✅ Found ${result.count} payments`);
      
      return {
        payments: result.rows,
        total: result.count,
        page,
        totalPages: Math.ceil(result.count / limit)
      };
    } catch (error) {
      console.error('❌ Error fetching payments:', error);
      throw new Error(`Failed to fetch payments: ${error.message}`);
    }
  }

  async getPaymentById(id) {
    await this.ensureInitialized();
    
    try {
      console.log(`🔍 Fetching payment by ID: ${id}`);
      
      // Use Sequelize's findByPk method
      const payment = await this.Payment.findByPk(id);
      
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      console.log(`✅ Payment found: ${payment.invoiceNumber}`);
      return payment;
    } catch (error) {
      console.error(`❌ Error fetching payment ${id}:`, error);
      throw new Error(`Failed to fetch payment: ${error.message}`);
    }
  }

  async updatePaymentStatus(id, status, notes = '') {
    await this.ensureInitialized();
    
    try {
      console.log(`🔄 Updating payment ${id} status to ${status}`);
      
      // Find payment using Sequelize
      const payment = await this.Payment.findByPk(id);
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      const oldStatus = payment.status;
      
      // Update payment
      await payment.update({ 
        status,
        notes: payment.notes ? `${payment.notes}\n${notes}` : notes
      });
      
      console.log(`✅ Payment ${id} updated from ${oldStatus} to ${status}`);
      
      return payment;
    } catch (error) {
      console.error(`❌ Error updating payment ${id}:`, error);
      throw new Error(`Failed to update payment status: ${error.message}`);
    }
  }

  async getPaymentStats(timeRange = 'month') {
    await this.ensureInitialized();
    
    try {
      console.log(`📊 Getting payment stats for ${timeRange}`);
      
      const now = new Date();
      let startDate;
      
      // Calculate start date based on time range
      switch (timeRange) {
        case 'day':
          startDate = new Date(now.setDate(now.getDate() - 1));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
        default:
          startDate = new Date(0);
      }
      
      // Get total revenue using Sequelize aggregate
      const totalRevenue = await this.Payment.sum('amount', {
        where: {
          status: 'completed',
          date: { [Op.gte]: startDate }
        }
      });
      
      // Get total completed payments count
      const totalPayments = await this.Payment.count({
        where: {
          status: 'completed',
          date: { [Op.gte]: startDate }
        }
      });
      
      // Get pending amount
      const pendingAmount = await this.Payment.sum('amount', {
        where: {
          status: 'pending',
          date: { [Op.gte]: startDate }
        }
      });
      
      // Get statistics by payment method
      const byMethod = await this.Payment.findAll({
        attributes: [
          'method',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
          [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']
        ],
        where: {
          status: 'completed',
          date: { [Op.gte]: startDate }
        },
        group: ['method']
      });
      
      console.log(`✅ Stats calculated - Revenue: $${totalRevenue || 0}`);
      
      return {
        totalRevenue: totalRevenue || 0,
        totalPayments: totalPayments || 0,
        pendingAmount: pendingAmount || 0,
        byMethod: byMethod || []
      };
    } catch (error) {
      console.error('❌ Error getting payment stats:', error);
      throw new Error(`Failed to get payment stats: ${error.message}`);
    }
  }

  async getPaymentsByInvoice(invoiceId) {
    await this.ensureInitialized();
    
    try {
      console.log(`🔍 Getting payments for invoice ${invoiceId}`);
      
      const payments = await this.Payment.findAll({
        where: { invoiceId },
        order: [['date', 'DESC']]
      });
      
      console.log(`✅ Found ${payments.length} payments for invoice ${invoiceId}`);
      return payments;
    } catch (error) {
      console.error(`❌ Error getting payments for invoice ${invoiceId}:`, error);
      throw new Error(`Failed to get payments by invoice: ${error.message}`);
    }
  }

  async getRecentPayments(limit = 10) {
    await this.ensureInitialized();
    
    try {
      console.log(`📋 Getting recent ${limit} payments`);
      
      const payments = await this.Payment.findAll({
        limit,
        order: [['date', 'DESC']]
      });
      
      console.log(`✅ Found ${payments.length} recent payments`);
      return payments;
    } catch (error) {
      console.error('❌ Error getting recent payments:', error);
      throw new Error(`Failed to get recent payments: ${error.message}`);
    }
  }

  async refundPayment(id, reason) {
    await this.ensureInitialized();
    
    try {
      console.log(`💸 Processing refund for payment ${id}`);
      
      // Mark original payment as refunded
      const payment = await this.updatePaymentStatus(
        id, 
        'refunded', 
        `Refunded: ${reason}`
      );
      
      // Create a negative payment for the refund
      const refundPayment = await this.createPayment({
        invoiceNumber: `REFUND-${payment.invoiceNumber}`,
        invoiceId: payment.invoiceId,
        exhibitorId: payment.exhibitorId,
        userId: payment.userId,
        amount: -payment.amount,
        method: payment.method,
        status: 'completed',
        notes: `Refund for payment ${payment.id}: ${reason}`,
        processedBy: 'system'
      });
      
      console.log(`✅ Refund processed successfully`);
      
      return {
        originalPayment: payment,
        refundPayment
      };
    } catch (error) {
      console.error(`❌ Error processing refund:`, error);
      throw new Error(`Failed to refund payment: ${error.message}`);
    }
  }
}

module.exports = new PaymentService();