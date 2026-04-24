import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';

// Configure multer for file uploads
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check file size (max 100MB)
  if (file.size > 100 * 1024 * 1024) {
    cb(new Error('File size too large. Maximum size is 100MB.'));
    return;
  }

  // Check file type (allow common types)
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/json',
    'application/xml',
    'application/zip',
    'application/octet-stream',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 1, // Single file upload
  },
});

export const uploadMiddleware = upload.single('file');

export const validateUpload = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: 'No file provided',
    });
    return;
  }

  // Validate file metadata
  const { originalname, mimetype, size } = req.file;
  
  if (!originalname || originalname.trim() === '') {
    res.status(400).json({
      success: false,
      error: 'File name is required',
    });
    return;
  }

  if (size === 0) {
    res.status(400).json({
      success: false,
      error: 'File is empty',
    });
    return;
  }

  next();
};
