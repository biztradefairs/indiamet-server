const { Sequelize } = require('sequelize');

function sanitizeNeonUrl(url) {
  if (!url) return url;
  return url
    .replace(/([?&])channel_binding=require&?/g, '$1')
    .replace(/[?&]$/, '');
}

function normalizeDbType(dbType = process.env.DB_TYPE) {
  return String(dbType || 'postgres').toLowerCase();
}

class Database {
  constructor() {
    this.dbType = normalizeDbType();
    this.connections = {};
    this._connected = false;
  }

  usesSequelize() {
    return ['mysql', 'postgres', 'postgresql', 'both'].includes(this.dbType);
  }

  createPostgres(connectionString) {
    return new Sequelize(sanitizeNeonUrl(connectionString), {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
  }

  async connectPostgres() {
    const pooledUrl = process.env.DATABASE_URL;
    const directUrl =
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DIRECT_URL ||
      pooledUrl;

    const connectionString = directUrl || pooledUrl;
    if (!connectionString) {
      throw new Error('DATABASE_URL or DATABASE_URL_UNPOOLED is required for Postgres/Neon');
    }

    const isNeon = connectionString.includes('neon.tech');
    console.log(
      `🔍 Connecting to Postgres${isNeon ? ' (Neon)' : ''} ` +
      `(${connectionString.includes('-pooler.') ? 'pooled' : 'direct'})`
    );

    const sequelize = this.createPostgres(connectionString);
    await sequelize.authenticate();

    console.log(isNeon ? '✅ Postgres connected to Neon' : '✅ Postgres connected');

    this.connections.postgres = sequelize;
    this.connections.mysql = sequelize;
    return sequelize;
  }

  async connect() {
    try {
      if (this.usesSequelize()) {
        await this.connectPostgres();
      }

      this._connected = true;
      console.log('🚀 Database layer ready');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  getConnection(type = 'postgres') {
    if (['mysql', 'postgres', 'postgresql', 'sql'].includes(type)) {
      const conn = this.connections.postgres || this.connections.mysql;
      if (!conn) {
        throw new Error('Postgres connection not available. Call connect() first.');
      }
      return conn;
    }

    const conn = this.connections[type];
    if (!conn) {
      throw new Error(`${type} connection not available. Call connect() first.`);
    }
    return conn;
  }

  isReady() {
    return this._connected;
  }

  async disconnect() {
    try {
      if (this.connections.postgres) {
        await this.connections.postgres.close();
      }

      this._connected = false;
      console.log('✅ Database connections closed');
    } catch (error) {
      console.error('❌ Error disconnecting databases:', error.message);
    }
  }
}

module.exports = new Database();
module.exports.usesSequelize = () =>
  ['mysql', 'postgres', 'postgresql', 'both'].includes(normalizeDbType());
