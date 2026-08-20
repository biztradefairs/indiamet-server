require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const database = require('./config/database');
const cookieParser = require('cookie-parser');
const { authenticate, authorize } = require('./middleware/auth');
const fs = require('fs');
require('express-async-errors');

// Import routes
const { trackVisitor, getVisitorStats } = require('./middleware/visitorTracker');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const exhibitorRoutes = require('./routes/exhibitors');
const articleRoutes = require('./routes/articles');
const exhibitorAuthRoutes = require('./routes/exhibitorAuth');
const boothRoutes = require('./routes/booths');
const exhibitorDashboardRoutes = require('./routes/exhibitorDashboard');
const emailService = require('./services/EmailService');
const floorPlanImageRoutes = require('./routes/floorPlanImage');
const uploadRoutes = require('./routes/upload');
const manualRoutes = require('./routes/manualRoutes');
const manualPDFRoutes = require('./routes/manualPDFRoutes');
const furnitureRoutes = require('./routes/furnitureRoutes');
const compressedAirRoutes = require('./routes/compressedAirRoutes');
const electricalRateRoutes = require('./routes/electricalRateRoutes');
const rentalItemRoutes = require('./routes/rentalItemRoutes');
const hostessCategoryRoutes = require('./routes/hostessCategoryRoutes');
const securityGuardRoutes = require('./routes/securityGuardRoutes');
const waterConnectionRoutes = require('./routes/waterConnectionRoutes');
const housekeepingRoutes = require('./routes/housekeepingRoutes');
const securityDepositRoutes = require('./routes/securityDepositRoutes');
const brochureRoutes = require('./routes/brochureRoutes'); // Add this
const visitorRoutes = require('./routes/visitorRoutes');
const contactRoutes = require("./routes/contact");
const floorPlanRoutes = require('./routes/floorPlanRoutes');
const exhibitorCredentialsRoutes = require('./routes/exhibitor-credentials');
const invoiceGenerateRoutes = require('./routes/invoiceGenerateRoutes');
const extraRequirementsRoutes = require('./routes/extraRequirementsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const cashfreeRoutes = require('./routes/cashfreeRoutes');

class AppServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.port = process.env.PORT || 5000;
    this.env = process.env.NODE_ENV || 'development';
    this.isShuttingDown = false;

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.connectDatabase = this.connectDatabase.bind(this);
    this.initializeModels = this.initializeModels.bind(this);
    this.setupMiddleware = this.setupMiddleware.bind(this);
    this.setupRoutes = this.setupRoutes.bind(this);
    this.setupErrorHandling = this.setupErrorHandling.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.checkDefaultAdmin = this.checkDefaultAdmin.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
    this.databaseTest = this.databaseTest.bind(this);
    this.testExhibitorCreation = this.testExhibitorCreation.bind(this);
    this.modelList = this.modelList.bind(this);
    this.serveStaticFiles = this.serveStaticFiles.bind(this);

    // Handle uncaught exceptions
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));

    this.initialize();
  }

  async initialize() {
    try {
      console.log('='.repeat(60));
      console.log('🚀 Starting Exhibition Admin Backend');
      console.log('='.repeat(60));
      console.log(`📁 Environment: ${this.env}`);
      console.log(`🔧 Node Version: ${process.version}`);
      console.log(`🗄️ Database Type: ${process.env.DB_TYPE || 'postgres'}`);
      console.log(`🌐 Port: ${this.port}`);
      console.log('='.repeat(60));

      // Step 1: Connect to database
      await this.connectDatabase();

      // Step 2: Initialize models
      await this.initializeModels();

      // Step 3: Setup middleware
      this.setupMiddleware();

      // Step 4: Setup routes
      this.setupRoutes();

      // Step 5: Setup error handling
      this.setupErrorHandling();

      // Step 6: Start server
      await this.start();

    } catch (error) {
      console.error(`❌ Failed to initialize server: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    }
  }

  async connectDatabase() {
    console.log('\n🔗 Connecting to database...');

    try {
      await database.connect();
      console.log('✅ Database connected successfully');

      // Test database connection
      const sequelize = database.getConnection('postgres');
      if (sequelize) {
        await sequelize.authenticate();
        console.log('✅ Database authentication successful');
      }

    } catch (error) {
      console.error(`❌ Database connection failed: ${error.message}`);

      // If in development, try to continue with mock data
      if (this.env === 'development') {
        console.warn('⚠️ Continuing in development mode with limited functionality');
      } else {
        throw error;
      }
    }
  }

  async initializeModels() {
    try {
      console.log('\n📦 Initializing models...');

      const modelFactory = require('./models');

      // Initialize models
      const models = await modelFactory.init();
      console.log(`✅ Models initialized: ${Object.keys(models).length} models loaded`);

      // Sync models with database (development only)
      if (this.env === 'development') {
        console.log('🔄 Syncing database models...');
        const sequelize = database.getConnection('postgres');
        if (sequelize) {
          try {
            // Use force: false to preserve existing data
            await sequelize.sync({ alter: true, force: false });
            console.log('✅ Database models synced successfully');
          } catch (syncError) {
            console.warn('⚠️ Database sync warning:', syncError.message);
            console.log('ℹ️ Continuing without full sync...');
          }
        }
      }

      // Test email service
      console.log('\n📧 Testing email service...');
      try {
        const emailTestResult = await emailService.testConnection();
        if (emailTestResult) {
          console.log('✅ Email service connected');
        }
      } catch (emailError) {
        console.warn('⚠️ Email service not available:', emailError.message);
      }

    } catch (error) {
      console.error(`❌ Failed to initialize models: ${error.message}`);

      // If in development, log error but continue
      if (this.env === 'development') {
        console.warn('⚠️ Continuing in development mode with limited functionality');
      } else {
        throw error;
      }
    }
  }

  // New method to serve static files with proper configuration
  serveStaticFiles() {
    console.log('Static uploads path:', path.join(process.cwd(), 'uploads'));
    console.log('\n📁 Setting up static file serving...');

    // Define upload directories
const uploadBase = path.join(process.cwd(), 'uploads');

const uploadDirs = [
  { name: 'brochures', path: path.join(uploadBase, 'brochures') },
  { name: 'manuals', path: path.join(uploadBase, 'manuals') },
  { name: 'images', path: path.join(uploadBase, 'images') },
  { name: 'floor-plans', path: path.join(uploadBase, 'floor-plans') }
];

    // Create directories if they don't exist
    uploadDirs.forEach(dir => {
      if (!fs.existsSync(dir.path)) {
        fs.mkdirSync(dir.path, { recursive: true });
        console.log(`📁 Created directory: uploads/${dir.name}`);
      }
    });

    // Serve static files with proper caching headers
    const staticOptions = {
      maxAge: this.env === 'production' ? '1d' : 0,
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        // Set proper content type for PDFs
        if (filePath.endsWith('.pdf')) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'inline');
        }
        // Cache control
        res.setHeader('Cache-Control', this.env === 'production' 
          ? 'public, max-age=86400' 
          : 'no-cache, no-store, must-revalidate');
      }
    };

    this.app.use(cookieParser());


    this.app.use(trackVisitor);
    // Serve from uploads directory
    this.app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), staticOptions));
    
    // Serve from public directory
    this.app.use('/public', express.static(path.join(__dirname, 'public'), staticOptions));

    // Add debug endpoint to check file existence
    this.app.get('/api/check-file/:type/:filename', (req, res) => {
      const { type, filename } = req.params;
      const filePath = path.join(process.cwd(), 'uploads', type, filename);
      
      const exists = fs.existsSync(filePath);
      const stats = exists ? fs.statSync(filePath) : null;
      
      res.json({
        success: exists,
        path: filePath,
        exists,
        stats: stats ? {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        } : null,
        url: `/uploads/${type}/${filename}`
      });
    });
    this.app.get('/api/visitor-stats', authenticate, authorize(['admin']), (req, res) => {
  const stats = getVisitorStats();
  res.json({
    success: true,
    data: stats
  });
});

    console.log('✅ Static file serving configured');
    console.log(`📂 Uploads directory: ${path.join(__dirname, 'uploads')}`);
    
    // List files in brochures directory for debugging
   const brochuresPath = path.join(process.cwd(), 'uploads', 'brochures');
    if (fs.existsSync(brochuresPath)) {
      const files = fs.readdirSync(brochuresPath);
      console.log(`📄 Brochures directory contains ${files.length} files:`);
      files.slice(0, 5).forEach(file => console.log(`   - ${file}`));
      if (files.length > 5) console.log(`   ... and ${files.length - 5} more`);
    }
  }

  setupMiddleware() {
    console.log('\n⚙️ Setting up middleware...');

    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    const corsOptions = {
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
          'https://www.diemex.in',
          process.env.FRONTEND_URL
        ].filter(Boolean);

        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
      exposedHeaders: ['Authorization']
    };

    this.app.use(cors(corsOptions));
    // Pre-flight requests
    this.app.options('*', cors(corsOptions));
    this.app.use((req, res, next) => {
  console.log('🌐 CORS Request from:', req.headers.origin);
  next();
});

    // HTTP request logging
    this.app.use(morgan(this.env === 'development' ? 'dev' : 'combined'));

    // Body parsing
    this.app.use(express.json({
      limit: '50mb',
      verify: (req, res, buf) => {
        req.rawBody = buf.toString();
      }
    }));

    this.app.use(express.urlencoded({
      extended: true,
      limit: '50mb'
    }));

    // Serve static files
    this.serveStaticFiles();

    this.app.get('/api/test/manuals-setup', async (req, res) => {
      try {
        const models = require('./models');
        models.init();

        const { Manual } = models.getAllModels();

        if (!Manual) {
          return res.status(500).json({
            success: false,
            error: 'Manual model not found',
            loadedModels: Object.keys(models.getAllModels())
          });
        }

        // Try to query the table
        const count = await Manual.count();

        // Try to get table info
        const tableName = Manual.getTableName();
        const tableInfo = await Manual.sequelize.query(
          `SELECT COUNT(*)::int as count
           FROM information_schema.tables
           WHERE table_schema = current_schema()
             AND table_name IN (:tableName, lower(:tableName))`,
          {
            replacements: { tableName },
            type: Manual.sequelize.QueryTypes.SELECT
          }
        );

        res.json({
          success: true,
          message: 'Manual model is working',
          tableExists: Number(tableInfo[0]?.count || 0) > 0,
          recordCount: count,
          loadedModels: Object.keys(models.getAllModels())
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    // Request logging middleware
    this.app.use((req, res, next) => {
      const startTime = Date.now();

      // Log request details
      if (this.env === 'development') {
        console.log(`📨 ${req.method} ${req.originalUrl}`);
        if (req.method === 'POST' || req.method === 'PUT') {
          console.log('📦 Body:', JSON.stringify(req.body).substring(0, 200) + '...');
        }
      }

      // Add response logging
      const originalSend = res.send;
      res.send = function (body) {
        const duration = Date.now() - startTime;
        console.log(`✅ ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        originalSend.call(this, body);
      };

      next();
    });

    // Health check middleware
    this.app.use((req, res, next) => {
      if (this.isShuttingDown) {
        return res.status(503).json({
          success: false,
          error: 'Server is shutting down',
          message: 'Please try again later'
        });
      }
      next();
    });

    console.log('✅ Middleware setup complete');
  }

// In your setupRoutes() method, add these debug routes after the system status endpoints

setupRoutes() {
  console.log('\n🚀 Loading API routes...');

  // ======================
  // System Status Endpoints
  // ======================

  // Health check
  this.app.get('/health', this.healthCheck);
  this.app.get('/api/health', this.healthCheck); // Add this for compatibility

  // Database test
  this.app.get('/api/db-test', this.databaseTest);

  // Model list
  this.app.get('/api/models', this.modelList);

  // Test exhibitor creation
  this.app.post('/api/test-exhibitor', this.testExhibitorCreation);

  // ======================
  // DEBUG ROUTES - ADD THESE
  // ======================
  
  // Debug: Check all registered routes
  this.app.get('/api/debug/routes', (req, res) => {
    const routes = [];
    
    function printRoutes(stack, basePath = '') {
      stack.forEach(layer => {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
          routes.push({
            method: methods.join(','),
            path: basePath + layer.route.path
          });
        } else if (layer.name === 'router' && layer.handle.stack) {
          let prefix = '';
          if (layer.regexp) {
            const match = layer.regexp.toString().match(/\/\^\\\/([^\\/]+)/);
            prefix = match ? '/' + match[1] : '';
          }
          printRoutes(layer.handle.stack, basePath + prefix);
        }
      });
    }
    
    printRoutes(this.app._router.stack);
    
    res.json({
      success: true,
      baseUrl: `${req.protocol}://${req.get('host')}`,
      routes: routes.sort((a, b) => a.path.localeCompare(b.path))
    });
  });

  // Debug: Check admin user
  this.app.get('/api/debug/check-admin', async (req, res) => {
    try {
      const modelFactory = require('./models');
      const User = modelFactory.getModel('User');
      const bcrypt = require('bcryptjs');
      
      const adminEmail = 'admin@example.com';
      const admin = await User.findOne({ where: { email: adminEmail } });
      
      if (!admin) {
        return res.json({
          success: false,
          exists: false,
          message: 'Admin user not found'
        });
      }
      
      // Check if password is hashed properly
      const testPassword = 'admin123';
      const isValid = await bcrypt.compare(testPassword, admin.password);
      
      return res.json({
        success: true,
        exists: true,
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        status: admin.status,
        passwordHashLength: admin.password.length,
        passwordIsValid: isValid,
        passwordStartsWith: admin.password.substring(0, 15) + '...',
        isHashed: admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'),
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt
      });
      
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Debug: Reset admin password (POST)
  this.app.post('/api/debug/reset-admin', async (req, res) => {
    try {
      const modelFactory = require('./models');
      const User = modelFactory.getModel('User');
      const bcrypt = require('bcryptjs');
      
      const adminEmail = 'admin@example.com';
      const adminPassword = 'admin123';
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      // Check if admin exists
      let admin = await User.findOne({ where: { email: adminEmail } });
      
      if (!admin) {
        // Create new admin
        admin = await User.create({
          name: 'Administrator',
          email: adminEmail,
          password: hashedPassword,
          role: 'admin',
          status: 'active'
        });
        
        res.json({
          success: true,
          message: 'Admin user created successfully',
          email: adminEmail,
          password: adminPassword
        });
      } else {
        // Update existing admin
        await admin.update({ password: hashedPassword });
        
        // Verify the password works
        const verifyPassword = await bcrypt.compare(adminPassword, admin.password);
        
        res.json({
          success: true,
          message: 'Admin password reset successfully',
          email: adminEmail,
          password: adminPassword,
          verified: verifyPassword
        });
      }
      
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Debug: Test login directly (POST)
  this.app.post('/api/debug/test-login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password required'
        });
      }
      
      const modelFactory = require('./models');
      const User = modelFactory.getModel('User');
      const bcrypt = require('bcryptjs');
      const jwt = require('jsonwebtoken');
      
      const user = await User.findOne({ where: { email } });
      
      if (!user) {
        return res.json({
          success: false,
          error: 'User not found',
          email
        });
      }
      
      const isValid = await bcrypt.compare(password, user.password);
      
      if (!isValid) {
        return res.json({
          success: false,
          error: 'Invalid password',
          email,
          passwordHash: user.password.substring(0, 15) + '...',
          isHashed: user.password.startsWith('$2a$') || user.password.startsWith('$2b$')
        });
      }
      
      // Generate token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
      
      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
      
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // ======================
  // API Routes
  // ======================

  // Authentication routes
  this.app.use('/api/auth', authRoutes);
  this.app.use('/api/auth/exhibitor', exhibitorAuthRoutes);
  
  // ALSO add direct /auth routes for compatibility with frontend
  this.app.use('/auth', authRoutes);

  // Protected API routes
  this.app.use('/api/users', userRoutes);
  this.app.use('/api/exhibitors', exhibitorRoutes);
  this.app.use('/api/articles', articleRoutes);
  this.app.use('/api/booths', boothRoutes);
  this.app.use('/api/exhibitorDashboard', exhibitorDashboardRoutes);
  // this.app.use('/api/floor-plan', boothRoutes);
  this.app.use('/api/upload', uploadRoutes);
  this.app.use('/api/manuals', manualRoutes);
  this.app.use('/api/manuals/pdfs', manualPDFRoutes);
  this.app.use('/api/admin/furniture', furnitureRoutes);
  this.app.use('/api/admin/compressed-air', compressedAirRoutes);
  this.app.use('/api/admin/electrical-rates', electricalRateRoutes);
  this.app.use('/api/admin/rental-items', rentalItemRoutes);
  this.app.use('/api/admin/hostess-rates', hostessCategoryRoutes);
  this.app.use('/api/admin/security-guard', securityGuardRoutes);
  this.app.use('/api/admin/water-connection', waterConnectionRoutes);
  this.app.use('/api/admin/housekeeping', housekeepingRoutes);
  this.app.use('/api/admin/security-deposit', securityDepositRoutes);
  this.app.use('/api/brochures', brochureRoutes);
  this.app.use('/api/visitors', visitorRoutes);
  this.app.use("/api/contact", contactRoutes);
  this.app.use('/api/floor-plan', floorPlanRoutes);
  this.app.use('/api/exhibitor-credentials', exhibitorCredentialsRoutes);
  this.app.use('/api/invoices', invoiceGenerateRoutes);
  this.app.use('/api/extra-requirements', extraRequirementsRoutes);
  this.app.use('/api/dashboard', dashboardRoutes);
  this.app.use('/api/payments', paymentRoutes);
  this.app.use('/api/cashfree', cashfreeRoutes);

  // ======================
  // Documentation & Info
  // ======================

  // API documentation
  this.app.get('/api', (req, res) => {
    res.json({
      success: true,
      message: 'Exhibition Admin API',
      version: '1.0.0',
      environment: this.env,
      endpoints: {
        auth: '/api/auth',
        users: '/api/users',
        exhibitors: '/api/exhibitors',
        articles: '/api/articles',
        exhibitorDashboard: '/api/exhibitorDashboard',
        brochures: '/api/brochures',
        debug: '/api/debug/routes'
      },
      documentation: 'See /api/docs for API documentation'
    });
  });

  // API documentation
  this.app.get('/api/docs', (req, res) => {
    const docs = {
      api: {
        version: '1.0.0',
        baseUrl: '/api',
        authentication: 'Bearer token required for protected routes'
      },
      endpoints: {
        auth: {
          login: 'POST /api/auth/login',
          register: 'POST /api/auth/register',
          profile: 'GET /api/auth/profile',
          refresh: 'POST /api/auth/refresh'
        },
        exhibitorAuth: {
          login: 'POST /api/auth/exhibitor/login',
          profile: 'GET /api/auth/exhibitor/profile'
        },
        exhibitors: {
          getAll: 'GET /api/exhibitors?page=1&limit=10&search=&sector=&status=',
          getStats: 'GET /api/exhibitors/stats',
          getById: 'GET /api/exhibitors/:id',
          create: 'POST /api/exhibitors',
          update: 'PUT /api/exhibitors/:id',
          delete: 'DELETE /api/exhibitors/:id',
          resendCredentials: 'POST /api/exhibitors/:id/resend-credentials',
          bulkUpdate: 'POST /api/exhibitors/bulk/update-status'
        },
        users: {
          getAll: 'GET /api/users',
          getById: 'GET /api/users/:id',
          create: 'POST /api/users',
          update: 'PUT /api/users/:id',
          delete: 'DELETE /api/users/:id'
        },
        brochures: {
          getAll: 'GET /api/brochures',
          create: 'POST /api/brochures',
          delete: 'DELETE /api/brochures/:id'
        },
        debug: {
          routes: 'GET /api/debug/routes',
          checkAdmin: 'GET /api/debug/check-admin',
          resetAdmin: 'POST /api/debug/reset-admin',
          testLogin: 'POST /api/debug/test-login'
        }
      }
    };

    res.json({
      success: true,
      data: docs
    });
  });

  // Fix for exhibitor login route
  this.app.post('/auth/exhibitor/login', (req, res, next) => {
    req.url = '/api/auth/exhibitor/login';
    this.app._router.handle(req, res, next);
  });

  console.log('✅ API routes loaded successfully');
  console.log('📌 Debug routes available at:');
  console.log('   - GET  /api/debug/routes');
  console.log('   - GET  /api/debug/check-admin');
  console.log('   - POST /api/debug/reset-admin');
  console.log('   - POST /api/debug/test-login');
}

  // ======================
  // Route Handlers
  // ======================

  async healthCheck(req, res) {
    try {
      const modelFactory = require('./models');
      let dbStatus = 'unknown';
      let exhibitorCount = 0;

      try {
        const Exhibitor = modelFactory.getModel('Exhibitor');
        exhibitorCount = await Exhibitor.count();
        dbStatus = 'connected';
      } catch (dbError) {
        dbStatus = 'disconnected';
      }

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: this.env,
        database: dbStatus,
        exhibitorCount: exhibitorCount,
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      };

      res.json(health);
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async databaseTest(req, res) {
    try {
      const modelFactory = require('./models');
      const Exhibitor = modelFactory.getModel('Exhibitor');

      // Test basic operations
      const count = await Exhibitor.count();

      // Try to create and delete a test record
      const testRecord = await Exhibitor.create({
        name: 'Database Test',
        email: `test-db-${Date.now()}@example.com`,
        company: 'Test Company',
        password: 'test123',
        status: 'active'
      });

      await testRecord.destroy();

      res.json({
        success: true,
        message: 'Database connection is working properly',
        operations: {
          count: 'success',
          create: 'success',
          delete: 'success'
        },
        exhibitorCount: count
      });
    } catch (error) {
      console.error('Database test error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: this.env === 'development' ? error.stack : undefined
      });
    }
  }

  async testExhibitorCreation(req, res) {
    try {
      const modelFactory = require('./models');
      const Exhibitor = modelFactory.getModel('Exhibitor');

      const testData = {
        name: 'Test Exhibitor ' + Date.now(),
        email: `test-exhibitor-${Date.now()}@example.com`,
        company: 'Test Company Inc',
        password: 'testpassword123',
        phone: '+1234567890',
        sector: 'Technology',
        boothNumber: 'TEST-' + Math.floor(Math.random() * 1000),
        status: 'active'
      };

      const exhibitor = await Exhibitor.create(testData);

      // Remove sensitive data
      const responseData = exhibitor.toJSON();
      delete responseData.password;
      delete responseData.resetPasswordToken;
      delete responseData.resetPasswordExpires;

      res.json({
        success: true,
        message: 'Test exhibitor created successfully',
        data: responseData
      });
    } catch (error) {
      console.error('Test exhibitor creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        details: error.errors ? error.errors.map(e => e.message) : undefined,
        stack: this.env === 'development' ? error.stack : undefined
      });
    }
  }

  async modelList(req, res) {
    try {
      const modelFactory = require('./models');
      const models = modelFactory.getAllModels();

      const modelInfo = {};
      Object.keys(models).forEach(modelName => {
        const model = models[modelName];
        modelInfo[modelName] = {
          tableName: model.tableName || model.collection?.name,
          attributes: Object.keys(model.rawAttributes || {}),
          associations: Object.keys(model.associations || {})
        };
      });

      res.json({
        success: true,
        count: Object.keys(models).length,
        models: modelInfo
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  setupErrorHandling() {
    console.log('\n⚠️ Setting up error handling...');

    // 404 Handler
    this.app.use((req, res, next) => {
      console.warn(`❌ 404 Not Found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.url} not found`,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('🔥 Unhandled Error:', {
        message: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        body: req.body
      });

      // Default error status
      const statusCode = error.statusCode || error.status || 500;

      // Prepare error response
      const errorResponse = {
        success: false,
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString()
      };

      // Add stack trace in development
      if (this.env === 'development') {
        errorResponse.stack = error.stack;
        errorResponse.details = error.errors ? error.errors.map(e => e.message) : undefined;
      }

      // Handle specific error types
      if (error.name === 'ValidationError') {
        errorResponse.error = 'Validation failed';
        errorResponse.details = error.errors || error.details;
      } else if (error.name === 'JsonWebTokenError') {
        errorResponse.error = 'Invalid token';
      } else if (error.name === 'TokenExpiredError') {
        errorResponse.error = 'Token expired';
      } else if (error.name === 'SequelizeUniqueConstraintError') {
        errorResponse.error = 'Duplicate entry';
        errorResponse.details = error.errors ? error.errors.map(e => e.message) : undefined;
      }

      res.status(statusCode).json(errorResponse);
    });

    console.log('✅ Error handling setup complete');
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, async () => {
        console.log('\n' + '='.repeat(60));
        console.log(`✅ Server running on port ${this.port}`);
        console.log(`🌐 Environment: ${this.env}`);
        console.log(`📊 Health Check: http://localhost:${this.port}/health`);
        console.log(`📚 API Docs: http://localhost:${this.port}/api/docs`);
        console.log(`🗄️ Database: ${process.env.DB_TYPE || 'postgres'}`);
        console.log(`📁 Static Files: http://localhost:${this.port}/uploads/`);

        // Check email configuration
        const hasEmailConfig = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
        console.log(`📧 Email Service: ${hasEmailConfig ? '✅ Configured' : '❌ Not configured'}`);

        console.log('='.repeat(60));
        console.log('\n📋 Available Endpoints:');
        console.log('├── POST /api/exhibitors                 - Create exhibitor (sends email)');
        console.log('├── POST /api/exhibitors/:id/resend-credentials - Resend credentials email');
        console.log('├── GET  /api/exhibitors                - List exhibitors');
        console.log('├── POST /api/auth/exhibitor/login      - Exhibitor login');
        console.log('├── POST /api/auth/login                - Admin login');
        console.log('├── GET  /uploads/brochures/:filename   - Access brochures');
        console.log('└── GET  /api/check-file/:type/:filename - Check file existence');
        console.log('='.repeat(60));

        // Check/create default admin user
        await this.checkDefaultAdmin();

        resolve();
      });

      this.server.on('error', (error) => {
        console.error(`❌ Server failed to start: ${error.message}`);

        // Handle specific port errors
        if (error.code === 'EADDRINUSE') {
          console.error(`💡 Port ${this.port} is already in use. Try a different port:`);
          console.error(`   node server.js --port ${parseInt(this.port) + 1}`);
          console.error(`   Or kill the process using port ${this.port}:`);
          console.error(`   lsof -ti:${this.port} | xargs kill -9`);
        }

        reject(error);
      });
    });
  }

async checkDefaultAdmin() {
  try {
    console.log('\n👤 Checking default admin user...');

    const modelFactory = require('./models');
    const User = modelFactory.getModel('User');
    const bcrypt = require('bcryptjs');

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@indiamet.com').toLowerCase();
    const plainPassword = process.env.ADMIN_PASSWORD || 'admin123';

    let admin = await User.findOne({
      where: { email: adminEmail }
    });

    if (!admin) {
      console.log('👤 Creating default admin user...');

      await User.create({
        name: 'Administrator',
        email: adminEmail,
        password: plainPassword,
        role: 'admin',
        status: 'active'
      });

      console.log('✅ Default admin user created');
    } else {
      console.log('🔄 Admin user already exists, checking if password update is needed...');

      const isPasswordCorrect = await bcrypt.compare(plainPassword, admin.password);

      if (!isPasswordCorrect) {
        console.log('🔄 Updating admin password...');
        await admin.update({
          password: plainPassword
        });
        console.log('✅ Admin password updated');
      } else {
        console.log('✅ Admin password is already correct');
      }
    }

    console.log(`📧 Email: ${adminEmail}`);
    console.log('🔑 Password: set from ADMIN_PASSWORD');
    console.log('✅ Admin user check completed');

  } catch (error) {
    console.error(`⚠️ Admin check failed: ${error.message}`);
  }
}

  // ======================
  // Error Handlers
  // ======================

  handleUncaughtException(error) {
    console.error('💥 Uncaught Exception:', error);
    console.error(error.stack);

    // Attempt graceful shutdown
    if (!this.isShuttingDown) {
      this.isShuttingDown = true;
      this.stop().then(() => {
        process.exit(1);
      }).catch(() => {
        process.exit(1);
      });
    }
  }

  handleUnhandledRejection(reason, promise) {
    console.error('💥 Unhandled Rejection at:', promise);
    console.error('Reason:', reason);

    // Log but don't exit for unhandled rejections
    console.log('⚠️ Unhandled rejection logged, continuing...');
  }

  async stop() {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    console.log('\n🛑 Stopping server gracefully...');

    return new Promise((resolve) => {
      // Close server
      if (this.server) {
        this.server.close(async () => {
          console.log('✅ HTTP server closed');

          try {
            // Close database connections
            await database.disconnect();
            console.log('✅ Database connections closed');
          } catch (dbError) {
            console.error('❌ Error closing database:', dbError.message);
          }

          console.log('✅ Server stopped gracefully');
          resolve();
        });

        // Force close after 10 seconds
        setTimeout(() => {
          console.log('⚠️ Forcing server shutdown...');
          process.exit(0);
        }, 10000);
      } else {
        resolve();
      }
    });
  }
}

// Handle graceful shutdown
const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
signals.forEach(signal => {
  process.on(signal, async () => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    const server = global.appServer;
    if (server) {
      await server.stop();
    }
    process.exit(0);
  });
});

// Create and export server instance
const appServer = new AppServer();
global.appServer = appServer;

// Export for testing
module.exports = {
  app: appServer.app,
  server: appServer.server,
  AppServer
};