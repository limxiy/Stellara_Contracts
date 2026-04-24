import { Router } from 'express';
import { StorageController } from '@/controllers/storage';
import { uploadMiddleware, validateUpload } from '@/middleware/upload';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per window
  message: {
    success: false,
    error: 'Too many upload requests, please try again later',
  },
});

const retrieveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 retrievals per window
  message: {
    success: false,
    error: 'Too many retrieve requests, please try again later',
  },
});

// Initialize controller (will be injected by main app)
let storageController: StorageController | null = null;

export const setStorageController = (controller: StorageController): void => {
  storageController = controller;
};

const getController = (): StorageController => {
  if (!storageController) {
    throw new Error('Storage controller not initialized');
  }
  return storageController;
};

// Upload routes
router.post('/upload', uploadLimiter, (req, res) => getController().upload(req, res));
router.post('/upload/file', uploadLimiter, uploadMiddleware, validateUpload, (req, res) => getController().uploadFile(req, res));

// Retrieve routes
router.post('/retrieve', retrieveLimiter, (req, res) => getController().retrieve(req, res));

// Management routes
router.post('/pin', (req, res) => getController().pin(req, res));
router.post('/verify', (req, res) => getController().verify(req, res));

// Status and metrics routes
router.get('/status', (req, res) => getController().getStatus(req, res));
router.get('/metrics', (req, res) => getController().getMetrics(req, res));
router.get('/cost-estimate', (req, res) => getController().getCostEstimate(req, res));

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Storage Gateway is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
