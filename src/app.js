import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import adminAttributesRoutes from './routes/attributes.routes.js';
import publicProductRoutes, { adminRouter as adminProductRoutes } from './routes/product.routes.js';
import cartRoutes from './routes/cart.routes.js';
import orderRoutes from './routes/orders.routes.js';
import contactRoutes, { adminRouter as adminContactRoutes } from './routes/contact.routes.js';
import businessRoutes, { adminRouter as adminBusinessRoutes } from './routes/business.routes.js';
import adminPromoRoutes from './routes/promo.routes.js';
import { adminRouter as adminDashboardRoutes } from './routes/dashboard.routes.js';
import { adminRouter as adminOrderRoutes } from './routes/orders.routes.js';
import { adminRouter as adminUsersRoutes } from './routes/users.routes.js';
import sellRoutes, { adminRouter as adminSellRoutes } from './routes/sell.routes.js';
import newsletterRoutes from './routes/newsletter.routes.js';
import env from './config/env.js';

const app = express();
const emailIconsDir = path.join(__dirname, '..', 'static', 'email-icons');

// Email signature icons — BEFORE compression (Gmail image proxy needs raw PNG)
app.get('/uploads/email-icons/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^[\w-]+\.png$/i.test(filename)) {
    return res.status(404).end();
  }

  const filePath = path.join(emailIconsDir, filename);
  if (!existsSync(filePath)) {
    return res.status(404).end();
  }

  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  res.sendFile(filePath);
});

// CORS configuration (see CORS_ORIGINS in .env)
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Compress all responses (gzip/deflate) — reduces payload size by 40-80%
app.use(compression());

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// User uploads (products, etc.)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    message: 'Server is running',
    health: '/health',
    timestamp: new Date().toISOString(),
  });
});
// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/attributes', adminAttributesRoutes);
app.use('/api/admin/products', adminProductRoutes);
app.use('/api/admin/orders', adminOrderRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/sell-requests', adminSellRoutes);
app.use('/api/admin/business-forms', adminBusinessRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin/contacts', adminContactRoutes);
app.use('/api/admin/promocodes', adminPromoRoutes);
app.use('/api/public/product', publicProductRoutes);
app.use('/api/public/business-form', businessRoutes);
app.use('/api/public/newsletter', newsletterRoutes);
app.use('/api/sell', sellRoutes);

// 404 — catch all undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    status: 'fail',
    message: 'The requested resource does not exist',
  });
});

// Global error handler
// AppError already sets err.status and err.statusCode, so we just use them directly.
app.use((err, req, res, next) => {
  console.error('Error:', err);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    status: err.status || 'error',
    message: err.message || 'Internal Server Error',
    ...(env.nodeEnv === 'development' && { stack: err.stack }),
  });
});

export default app;
// touch to restart nodemon
