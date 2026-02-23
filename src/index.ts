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
import instructorRouter from './routes/instructorRouter';
import { scholarshipRouter } from './routes/scholarshipRouter';
import aiRouter from './routes/grogRouter';


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

// src/index.ts

const allowedOrigins = [
  'http://localhost:3000',
  'https://ahfidlearn.netlify.app',
  'https://ahfidlms.vercel.app',
  'https://learneasy-two.vercel.app',
  'https://ahfid-lms.onrender.com',
  process.env.CLIENT_URL, // Fallback to env variable
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: (origin: string | undefined, callback: any) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
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
// ✅ IMPROVED RATE LIMITERS FOR DEVELOPMENT
// ============================================
const isDevelopment = process.env.NODE_ENV === 'development';

// ✅ Skip rate limiting entirely in development for localhost
const skipRateLimitInDev = (req: Request) => {
  if (!isDevelopment) return false;
  
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = forwardedFor 
    ? (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0])
    : req.socket.remoteAddress;
  
  // Skip for localhost
  if (ip === '::1' || ip === '127.0.0.1' || ip?.includes('localhost')) {
    return true;
  }
  
  return false;
};

// ✅ General API rate limiter - very lenient in dev
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 10000 : 100, // 10k in dev, 100 in prod
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInDev, // Skip entirely for localhost in dev
  // ✅ Don't block on headers issues
  skipFailedRequests: isDevelopment,
  handler: (req, res) => {
    if (isDevelopment) {
      console.warn('⚠️ Rate limit reached (dev mode):', req.path);
    }
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// ✅ Apply general limiter only to non-auth routes in dev
if (isDevelopment) {
  // In dev, only apply to routes that aren't auth-related
  app.use('/api/v1/', (req, res, next) => {
    if (req.path.includes('/auth/me') || req.path.includes('/auth/refresh')) {
      return next(); // Skip rate limiting for auth checks
    }
    return generalLimiter(req, res, next);
  });
} else {
  // In production, apply to all routes
  app.use('/api/', generalLimiter);
}

// ✅ Auth-specific limiter - DISABLED in development
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 10000 : 10, // Unlimited in dev, 10 in prod
  message: {
    success: false,
    error: 'Too many authentication attempts, try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true,
  skip: (req) => {
    // ✅ Always skip in development
    if (isDevelopment) return true;
    
    // ✅ Also skip for /auth/me and /auth/refresh even in production
    if (req.path.includes('/auth/me') || req.path.includes('/auth/refresh')) {
      return true;
    }
    
    return false;
  },
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
// ✅ IMPROVED ERROR HANDLER
// ============================================
app.use((err: any, req: any, res: any, next: any) => {
  // ✅ More detailed logging in development
  if (isDevelopment) {
    console.error('❌ Error Handler:', {
      message: err.message,
      status: err.status,
      path: req.path,
      method: req.method,
      stack: err.stack?.split('\n').slice(0, 3), // First 3 lines of stack
    });
  } else {
    console.error('❌ Error Handler:', {
      message: err.message,
      status: err.status,
      path: req.path,
      method: req.method,
    });
  }

  // ✅ Don't expose internal errors in production
  const message = isDevelopment 
    ? err.message 
    : 'Server error';

  res.status(err.status || 500).json({
    success: false,
    error: message,
    ...(isDevelopment && { 
      stack: err.stack,
      details: err.details || null 
    })
  });
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
      submission: '/api/v1/submissions',
      instructors: '/api/v1/instructors',
      scholarship: '/api/v1/scholarship',
      aiAssistant: "/api/v1/aiAssistant",
    },
  });
});

// Mount Routes
app.use('/api/v1/auth', authRoutes); // No auth limiter applied
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
app.use('/api/v1/submissions', submissionRouter);
app.use('/api/v1/instructors', instructorRouter);
app.use("/api/v1/scholarship", scholarshipRouter)
app.use("/api/v1/aiAssistant", aiRouter)

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
  
  if (isDevelopment) {
    console.log('🔥 Hot reload friendly - Rate limiting disabled for localhost');
  }
});

// Export app
export default app;