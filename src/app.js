
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Routes
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const punchRoutes = require('./routes/punchRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
const regularizationRoutes = require('./routes/regularizationRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const adminRoutes = require('./routes/adminRoutes')
const auditRoutes = require('./routes/auditRoutes')

const app = express();

const BASE_API_PATH = '/api/v1';

// =====================
// Middleware
// =====================

app.use(helmet());

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

// Rate Limiter
// =====================
// RATE LIMITERS
// =====================

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});

// Stricter authentication limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

// Apply general limiter to APIs
app.use('/api', apiLimiter);

// =====================
// Health Check
// =====================

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================
// Routes
// =====================

app.use(`${BASE_API_PATH}/auth`, authRoutes);
app.use(`${BASE_API_PATH}/employees`, employeeRoutes);
app.use(`${BASE_API_PATH}/attendance`, attendanceRoutes);
app.use(`${BASE_API_PATH}/punch`, punchRoutes);
app.use(`${BASE_API_PATH}/leave`, leaveRoutes);
app.use(`${BASE_API_PATH}/permission`, permissionRoutes);
app.use(`${BASE_API_PATH}/regularization`, regularizationRoutes);
app.use(`${BASE_API_PATH}/payroll`, payrollRoutes);
app.use(`${BASE_API_PATH}/settings`, settingsRoutes);
app.use(`${BASE_API_PATH}/admin`, adminRoutes)
app.use(`${BASE_API_PATH}/audit`, auditRoutes)
// =====================
// 404 Handler
// =====================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
    },
  });
});

// =====================
// Global Error Handler
// =====================

app.use((err, req, res, next) => {
  console.error(err);

  return res.status(500).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: err.message || 'Internal server error',
    },
  });
});

// PDF PATH

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use(
  "/payslips",
  express.static(
    path.join(process.cwd(), "uploads/payslips")
  )
);

module.exports = app;