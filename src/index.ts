// ============================================
// src/index.ts - Main Server Entry Point
// ============================================

import express, { Application, Request, Response } from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import http from 'http';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/authRouter';
import adminRoutes from './routes/adminRouter';
import courseRoutes from './routes/courseRouter';
import moduleRoutes from './routes/moduleRouter';
import lessonRoutes from './routes/lessonRouter';
import assessmentRoutes from './routes/assessmentRouter';
import studentRoutes from './routes/studentRouter';
import enrollmentRouter from './routes/enrollmentRouter';
import certificateRoutes from './routes/certificateRouter';
import notificationRouter from './routes/notificationRouter';
import progressRouter from './routes/progressRouter';
import submissionRouter from './routes/submissionRouter';
import programRouter from './routes/programRouter';

// Error handler middleware
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';

// Socket.IO
import { initSocket } from './config/socket';

// Initialize express app
const app: Application = express();

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));
else app.use(morgan('combined'));

// ============================================
// RATE LIMITERS (In-memory, no Redis)
// ============================================
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many requests from this IP, try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, try again later.',
  skipSuccessfulRequests: true,
});

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================
// DATABASE CONNECTION
// ============================================
const connectDB = async (): Promise<void> => {
  try {
    const mongoURI =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-accelerator';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB Connected Successfully');

    mongoose.connection.on('error', (err) =>
      console.error('❌ MongoDB error:', err)
    );
    mongoose.connection.on('disconnected', () =>
      console.warn('⚠️ MongoDB disconnected')
    );
    mongoose.connection.on('reconnected', () =>
      console.log('🔄 MongoDB reconnected')
    );
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};
connectDB();

// ============================================
// SOCKET.IO SETUP
// ============================================
const server = http.createServer(app);
const io = initSocket(server);

// Middleware to attach io to requests (optional)
app.use((req, _res, next) => {
  req.app.set('io', io);
  next();
});

// ============================================
// API ROUTES
// ============================================

// Health Check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Welcome
app.get('/api', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to AI Accelerator API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      admin: '/api/v1/admin',
      courses: '/api/v1/courses',
      modules: '/api/v1/modules',
      lessons: '/api/v1/lessons',
      assessments: '/api/v1/assessments',
      students: '/api/v1/students',
      enrollments: '/api/v1/enrollments',
      certificates: '/api/v1/certificates',
      notifications: '/api/v1/notifications',
      progress: '/api/v1/progress',
      program: '/api/v1/programs',
      submission: '/api/v1/submission',
    },
  });
});

// Mount Routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/modules', moduleRoutes);
app.use('/api/v1/lessons', lessonRoutes);
app.use('/api/v1/assessments', assessmentRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/enrollments', enrollmentRouter);
app.use('/api/v1/certificates', certificateRoutes);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/progress', progressRouter);
app.use('/api/v1/programs', programRouter);
app.use('/api/v1/submission', submissionRouter);

// Error Handling
app.use(notFound);
app.use(errorHandler);

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n ${signal} received. Shutting down gracefully...`);

  try {
    // Stop accepting new HTTP connections
    server.close(() => {
      console.log('✅ HTTP server closed');
    });

    // Close Socket.IO
    io.close(() => {
      console.log('✅ Socket.IO server closed');
    });

    // Close MongoDB
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');

    console.log('🎉 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }

  // Force shutdown safety net
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error: Error) => {
  console.error('❌ UNCAUGHT EXCEPTION! Shutting down...');
  console.error(error.name, error.message, error.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...');
  console.error(reason);
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(
    `🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`
  );
  console.log(`🚀 Listening on port ${PORT}`);
});

// Export app
export default app;
