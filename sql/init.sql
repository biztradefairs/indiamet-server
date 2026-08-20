-- sql/init.sql
-- Neon Postgres schema for IndiaMet
-- The database `neondb` already exists on Neon; tables are also
-- created/updated by Sequelize sync on server start.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'viewer',
  status VARCHAR(50) DEFAULT 'active',
  phone VARCHAR(50),
  "lastLogin" TIMESTAMP,
  settings JSONB,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'draft',
  author VARCHAR(255),
  views INTEGER DEFAULT 0,
  image VARCHAR(500),
  metadata JSONB,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exhibitors (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  company VARCHAR(255) NOT NULL,
  password VARCHAR(255),
  sector VARCHAR(100),
  booth VARCHAR(50),
  "boothNumber" VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  website VARCHAR(500),
  address TEXT,
  "stallDetails" JSONB,
  "registrationDate" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "lastLogin" TIMESTAMP,
  "resetPasswordToken" VARCHAR(255),
  "resetPasswordExpires" TIMESTAMP,
  details JSONB,
  metadata JSONB,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY,
  "invoiceNumber" VARCHAR(100) UNIQUE NOT NULL,
  "exhibitorId" UUID REFERENCES exhibitors(id) ON DELETE SET NULL,
  company VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  "issueDate" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP NOT NULL,
  "paidDate" TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  items JSONB,
  notes TEXT,
  terms TEXT,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  "invoiceNumber" VARCHAR(100),
  "invoiceId" UUID REFERENCES invoices(id) ON DELETE SET NULL,
  "exhibitorId" UUID REFERENCES exhibitors(id) ON DELETE SET NULL,
  "userId" UUID,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  method VARCHAR(50) NOT NULL,
  "transactionId" VARCHAR(255),
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP,
  "processedBy" VARCHAR(255),
  notes TEXT,
  metadata JSONB,
  source VARCHAR(255) DEFAULT 'exhibition',
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "floorPlans" (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  floor VARCHAR(100),
  image VARCHAR(255),
  scale DECIMAL(5,2) DEFAULT 1.0,
  "gridSize" INTEGER DEFAULT 10,
  shapes JSONB,
  "createdBy" VARCHAR(255),
  "updatedBy" VARCHAR(255),
  version VARCHAR(50) DEFAULT '1.0',
  metadata JSONB,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requirements (
  id UUID PRIMARY KEY,
  "exhibitorId" UUID NOT NULL REFERENCES exhibitors(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'pending',
  cost DECIMAL(10,2),
  notes TEXT,
  metadata JSONB,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  "userId" UUID,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  "readAt" TIMESTAMP,
  priority VARCHAR(20) DEFAULT 'medium',
  "expiresAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "auditLogs" (
  id UUID PRIMARY KEY,
  action VARCHAR(255) NOT NULL,
  "userId" UUID,
  "userEmail" VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  details JSONB,
  service VARCHAR(100) DEFAULT 'admin-service',
  "ipAddress" VARCHAR(100),
  "userAgent" TEXT,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  source VARCHAR(255) NOT NULL,
  severity VARCHAR(20) DEFAULT 'medium',
  acknowledged BOOLEAN DEFAULT FALSE,
  "acknowledgedBy" UUID,
  "acknowledgedAt" TIMESTAMP,
  data JSONB,
  "expiresAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_user_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_exhibitor_email ON exhibitors(email);
CREATE INDEX IF NOT EXISTS idx_exhibitor_company ON exhibitors(company);
CREATE INDEX IF NOT EXISTS idx_exhibitor_status ON exhibitors(status);
CREATE INDEX IF NOT EXISTS idx_exhibitor_sector ON exhibitors(sector);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
