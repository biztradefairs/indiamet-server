// src/kafka/consumer.js
const { Kafka } = require('kafkajs');

class KafkaConsumer {
  constructor() {
    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID,
      brokers: process.env.KAFKA_BROKERS.split(',')
    });
    this.consumer = this.kafka.consumer({ groupId: 'admin-service-group' });
    this.handlers = new Map();
  }

  async connect() {
    await this.consumer.connect();
    console.log('Kafka Consumer connected');
  }

  async disconnect() {
    await this.consumer.disconnect();
    console.log('Kafka Consumer disconnected');
  }

  async subscribe(topic, handler) {
    await this.consumer.subscribe({ topic, fromBeginning: false });
    this.handlers.set(topic, handler);
    
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const handler = this.handlers.get(topic);
        if (handler) {
          try {
            const value = JSON.parse(message.value.toString());
            await handler(value);
          } catch (error) {
            console.error(`Error processing message from topic ${topic}:`, error);
          }
        }
      }
    });
  }

  // Subscribe to common topics
  async setupCommonSubscriptions() {
    // Audit log handler
    await this.subscribe('audit-logs', async (log) => {
      console.log('Audit Log Received:', log);
      // Store audit log in database
      const AuditLog = require('../models').getModel('AuditLog');
      await AuditLog.create(log);
    });

    // Notification handler
    await this.subscribe('notifications', async (notification) => {
      console.log('Notification Received:', notification);
      // Send email/SMS/push notification
      // You can integrate with your notification service here
    });

    // User activity handler
    await this.subscribe('user-activity', async (activity) => {
      console.log('User Activity:', activity);
      // Update user last activity timestamp
      const User = require('../models').getModel('User');
      await User.update(
        { lastActivity: new Date() },
        { where: { id: activity.userId } }
      );
    });
  }
}

module.exports = new KafkaConsumer();