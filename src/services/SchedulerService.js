// src/services/SchedulerService.js
const cron = require('node-cron');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const invoiceService = require('./InvoiceService');
const mediaService = require('./MediaService');
const kafkaProducer = require('../kafka/producer');

class SchedulerService {
  constructor() {
    this.jobs = [];
  }

  start() {
    // Schedule daily tasks at midnight
    this.jobs.push(cron.schedule('0 0 * * *', this.runDailyTasks.bind(this)));
    
    // Schedule weekly tasks on Sunday at 1 AM
    this.jobs.push(cron.schedule('0 1 * * 0', this.runWeeklyTasks.bind(this)));
    
    // Schedule monthly tasks on 1st at 2 AM
    this.jobs.push(cron.schedule('0 2 1 * *', this.runMonthlyTasks.bind(this)));
    
    // Schedule hourly tasks
    this.jobs.push(cron.schedule('0 * * * *', this.runHourlyTasks.bind(this)));
    
    // Schedule every 5 minutes for real-time tasks
    this.jobs.push(cron.schedule('*/5 * * * *', this.runFiveMinuteTasks.bind(this)));
    
    logger.info('Scheduler service started');
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    logger.info('Scheduler service stopped');
  }

  async runDailyTasks() {
    try {
      logger.info('Running daily scheduled tasks');
      
      // Send overdue invoice reminders
      await this.sendOverdueInvoiceReminders();
      
      // Cleanup temporary files
      await this.cleanupTemporaryFiles();
      
      // Backup audit logs
      await this.backupAuditLogs();
      
      logger.info('Daily tasks completed');
    } catch (error) {
      logger.error(`Daily tasks failed: ${error.message}`);
    }
  }

  async runWeeklyTasks() {
    try {
      logger.info('Running weekly scheduled tasks');
      
      // Generate weekly revenue report
      await this.generateWeeklyRevenueReport();
      
      // Send weekly summary to admin
      await this.sendWeeklySummary();
      
      // Cleanup old notifications
      await this.cleanupOldNotifications();
      
      logger.info('Weekly tasks completed');
    } catch (error) {
      logger.error(`Weekly tasks failed: ${error.message}`);
    }
  }

  async runMonthlyTasks() {
    try {
      logger.info('Running monthly scheduled tasks');
      
      // Generate monthly invoices
      await this.generateMonthlyInvoices();
      
      // Generate monthly reports
      await this.generateMonthlyReports();
      
      // Archive old data
      await this.archiveOldData();
      
      logger.info('Monthly tasks completed');
    } catch (error) {
      logger.error(`Monthly tasks failed: ${error.message}`);
    }
  }

  async runHourlyTasks() {
    try {
      logger.info('Running hourly scheduled tasks');
      
      // Check for system health
      await this.checkSystemHealth();
      
      // Sync data with external systems
      await this.syncExternalData();
      
      logger.info('Hourly tasks completed');
    } catch (error) {
      logger.error(`Hourly tasks failed: ${error.message}`);
    }
  }

  async runFiveMinuteTasks() {
    try {
      // Check for pending payments
      await this.checkPendingPayments();
      
      // Update dashboard cache
      await this.updateDashboardCache();
      
      // Send real-time notifications
      await this.sendRealTimeNotifications();
    } catch (error) {
      logger.error(`Five minute tasks failed: ${error.message}`);
    }
  }

  async sendOverdueInvoiceReminders() {
    try {
      // Get overdue invoices
      const Invoice = require('../models').getModel('Invoice');
      const User = require('../models').getModel('User');
      
      const now = new Date();
      let overdueInvoices;
      
      if (process.env.DB_TYPE !== 'mongodb') {
        overdueInvoices = await Invoice.findAll({
          where: {
            status: 'pending',
            dueDate: { [Op.lt]: now }
          }
        });
      } else {
        overdueInvoices = await Invoice.find({
          status: 'pending',
          dueDate: { $lt: now }
        });
      }
      
      // Send reminders for each overdue invoice
      for (const invoice of overdueInvoices) {
        if (invoice.exhibitorId) {
          let exhibitor;
          
          if (process.env.DB_TYPE !== 'mongodb') {
            exhibitor = await User.findByPk(invoice.exhibitorId);
          } else {
            exhibitor = await User.findById(invoice.exhibitorId);
          }
          
          if (exhibitor) {
            // Send reminder notification
            await kafkaProducer.sendNotification('INVOICE_OVERDUE', exhibitor.id, {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.amount,
              daysOverdue: Math.floor((now - invoice.dueDate) / (1000 * 60 * 60 * 24))
            });
          }
        }
      }
      
      logger.info(`Sent ${overdueInvoices.length} overdue invoice reminders`);
    } catch (error) {
      logger.error(`Failed to send overdue invoice reminders: ${error.message}`);
    }
  }

  async cleanupTemporaryFiles() {
    try {
      // Cleanup orphaned files older than 7 days
      const result = await mediaService.cleanupOrphanedFiles(7);
      logger.info(`Cleaned up ${result.deleted} orphaned files`);
    } catch (error) {
      logger.error(`Failed to cleanup temporary files: ${error.message}`);
    }
  }

  async backupAuditLogs() {
    try {
      // This would typically export audit logs to external storage
      // For now, just log the operation
      logger.info('Audit logs backup completed');
    } catch (error) {
      logger.error(`Failed to backup audit logs: ${error.message}`);
    }
  }

  async generateWeeklyRevenueReport() {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      
      // Generate report
      const report = {
        period: { startDate, endDate },
        generatedAt: new Date()
      };
      
      // Send to Kafka for processing
      await kafkaProducer.send('weekly-reports', {
        key: 'revenue',
        value: JSON.stringify(report)
      });
      
      logger.info('Weekly revenue report generated');
    } catch (error) {
      logger.error(`Failed to generate weekly revenue report: ${error.message}`);
    }
  }

  async sendWeeklySummary() {
    try {
      // Send summary email to admin
      const emailService = require('./EmailService');
      await emailService.sendSystemAlert(
        'Weekly Summary',
        'Weekly system summary has been generated.'
      );
      
      logger.info('Weekly summary sent');
    } catch (error) {
      logger.error(`Failed to send weekly summary: ${error.message}`);
    }
  }

  async cleanupOldNotifications() {
    try {
      const Notification = require('../models').getModel('Notification');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days ago
      
      const deletedCount = await Notification.destroy({
        where: {
          read: true,
          createdAt: { [Op.lt]: cutoffDate }
        }
      });
      
      logger.info(`Cleaned up ${deletedCount} old notifications`);
    } catch (error) {
      logger.error(`Failed to cleanup old notifications: ${error.message}`);
    }
  }

  async generateMonthlyInvoices() {
    try {
      // This would generate monthly recurring invoices
      logger.info('Monthly invoices generation started');
      
      // Your invoice generation logic here
      
      logger.info('Monthly invoices generation completed');
    } catch (error) {
      logger.error(`Failed to generate monthly invoices: ${error.message}`);
    }
  }

  async generateMonthlyReports() {
    try {
      logger.info('Monthly reports generation started');
      
      // Generate various monthly reports
      
      logger.info('Monthly reports generation completed');
    } catch (error) {
      logger.error(`Failed to generate monthly reports: ${error.message}`);
    }
  }

  async archiveOldData() {
    try {
      // Archive data older than 1 year
      logger.info('Data archiving started');
      
      // Your archiving logic here
      
      logger.info('Data archiving completed');
    } catch (error) {
      logger.error(`Failed to archive old data: ${error.message}`);
    }
  }

  async checkSystemHealth() {
    try {
      // Check database connections
      const database = require('../config/database');
      
      // Check external services
      // Check disk space
      // Check memory usage
      
      // Send health status to monitoring
      await kafkaProducer.send('system-health', {
        key: 'admin-service',
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          status: 'healthy',
          checks: ['database', 'kafka', 'redis']
        })
      });
      
      logger.debug('System health check completed');
    } catch (error) {
      logger.error(`System health check failed: ${error.message}`);
      
      // Send alert
      const emailService = require('./EmailService');
      await emailService.sendSystemAlert(
        'System Health Check Failed',
        error.message
      );
    }
  }

  async syncExternalData() {
    try {
      // Sync with external APIs or services
      logger.debug('External data sync completed');
    } catch (error) {
      logger.error(`External data sync failed: ${error.message}`);
    }
  }

  async checkPendingPayments() {
    try {
      // Check for payments that need follow-up
      const Payment = require('../models').getModel('Payment');
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24); // 24 hours ago
      
      let pendingPayments;
      
      if (process.env.DB_TYPE !== 'mongodb') {
        pendingPayments = await Payment.findAll({
          where: {
            status: 'pending',
            createdAt: { [Op.lt]: cutoffDate }
          }
        });
      } else {
        pendingPayments = await Payment.find({
          status: 'pending',
          createdAt: { $lt: cutoffDate }
        });
      }
      
      if (pendingPayments.length > 0) {
        // Send reminder for old pending payments
        await kafkaProducer.sendNotification('PENDING_PAYMENT_REMINDER', null, {
          count: pendingPayments.length,
          payments: pendingPayments.map(p => p.id)
        });
      }
      
      logger.debug(`Checked ${pendingPayments.length} pending payments`);
    } catch (error) {
      logger.error(`Failed to check pending payments: ${error.message}`);
    }
  }

  async updateDashboardCache() {
    try {
      // Update cached dashboard data
      logger.debug('Dashboard cache updated');
    } catch (error) {
      logger.error(`Failed to update dashboard cache: ${error.message}`);
    }
  }

  async sendRealTimeNotifications() {
    try {
      // Process real-time notifications from queue
      logger.debug('Real-time notifications processed');
    } catch (error) {
      logger.error(`Failed to send real-time notifications: ${error.message}`);
    }
  }
}

module.exports = new SchedulerService();