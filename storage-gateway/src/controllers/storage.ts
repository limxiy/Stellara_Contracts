import { Request, Response } from 'express';
import { StorageGatewayService } from '@/services/storage-gateway';
import logger from '@/utils/logger';
import Joi from 'joi';

const uploadSchema = Joi.object({
  content: Joi.string().required(),
  name: Joi.string().optional(),
  contentType: Joi.string().optional(),
  tier: Joi.string().valid('cold', 'standard', 'hot').optional(),
  priority: Joi.string().valid('low', 'standard', 'high').optional(),
  replicationFactor: Joi.number().integer().min(1).max(5).optional(),
  optimizeCosts: Joi.boolean().optional(),
  tags: Joi.object().optional(),
});

const retrieveSchema = Joi.object({
  identifier: Joi.string().required(),
  preferredProvider: Joi.string().optional(),
  useCache: Joi.boolean().optional(),
  verifyHash: Joi.boolean().optional(),
  timeout: Joi.number().optional(),
});

const pinSchema = Joi.object({
  identifier: Joi.string().required(),
  provider: Joi.string().optional(),
});

const verifySchema = Joi.object({
  identifier: Joi.string().required(),
  expectedHash: Joi.string().optional(),
  provider: Joi.string().optional(),
});

export class StorageController {
  private storageService: StorageGatewayService;

  constructor(storageService: StorageGatewayService) {
    this.storageService = storageService;
  }

  upload = async (req: Request, res: Response): Promise<void> => {
    try {
      const { error, value } = uploadSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message),
        });
        return;
      }

      const content = Buffer.from(value.content, 'base64');
      const options = {
        name: value.name,
        contentType: value.contentType,
        tier: value.tier,
        priority: value.priority,
        replicationFactor: value.replicationFactor,
        optimizeCosts: value.optimizeCosts,
        tags: value.tags,
      };

      const results = await this.storageService.upload(content, options);
      
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (successful.length === 0) {
        res.status(500).json({
          success: false,
          error: 'Upload failed on all providers',
          results: failed,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `Upload completed: ${successful.length}/${results.length} successful`,
        results,
        summary: {
          totalProviders: results.length,
          successful: successful.length,
          failed: failed.length,
          identifiers: successful.map(r => ({ provider: r.provider, identifier: r.identifier })),
        },
      });
    } catch (error) {
      logger.error('Upload controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  retrieve = async (req: Request, res: Response): Promise<void> => {
    try {
      const { error, value } = retrieveSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message),
        });
        return;
      }

      const options = {
        preferredProvider: value.preferredProvider,
        useCache: value.useCache,
        verifyHash: value.verifyHash,
        timeout: value.timeout,
      };

      const result = await this.storageService.retrieve(value.identifier, options);

      if (!result.success) {
        res.status(404).json({
          success: false,
          error: 'Content not found or retrieval failed',
          details: result.error,
        });
        return;
      }

      // Return content as base64 for JSON response
      const contentBase64 = result.content.toString('base64');
      
      res.status(200).json({
        success: true,
        identifier: value.identifier,
        content: contentBase64,
        hash: result.hash,
        size: result.size,
        provider: result.provider,
        cached: result.cached,
        verified: result.verified,
        timestamp: result.timestamp,
      });
    } catch (error) {
      logger.error('Retrieve controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  uploadFile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file provided',
        });
        return;
      }

      const options = {
        name: req.file.originalname,
        contentType: req.file.mimetype,
        tier: req.body.tier,
        priority: req.body.priority,
        replicationFactor: req.body.replicationFactor ? parseInt(req.body.replicationFactor) : undefined,
        optimizeCosts: req.body.optimizeCosts === 'true',
        tags: req.body.tags ? JSON.parse(req.body.tags) : undefined,
      };

      const results = await this.storageService.upload(req.file.buffer, options);
      
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (successful.length === 0) {
        res.status(500).json({
          success: false,
          error: 'File upload failed on all providers',
          results: failed,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `File upload completed: ${successful.length}/${results.length} successful`,
        filename: req.file.originalname,
        size: req.file.size,
        contentType: req.file.mimetype,
        results,
        summary: {
          totalProviders: results.length,
          successful: successful.length,
          failed: failed.length,
          identifiers: successful.map(r => ({ provider: r.provider, identifier: r.identifier })),
        },
      });
    } catch (error) {
      logger.error('File upload controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  pin = async (req: Request, res: Response): Promise<void> => {
    try {
      const { error, value } = pinSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message),
        });
        return;
      }

      const results = await this.storageService.pinContent(value.identifier, value.provider);
      
      res.status(200).json({
        success: true,
        identifier: value.identifier,
        results,
      });
    } catch (error) {
      logger.error('Pin controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  verify = async (req: Request, res: Response): Promise<void> => {
    try {
      const { error, value } = verifySchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message),
        });
        return;
      }

      const results = await this.storageService.verifyContent(value.identifier, value.expectedHash, value.provider);
      
      res.status(200).json({
        success: true,
        identifier: value.identifier,
        expectedHash: value.expectedHash,
        results,
      });
    } catch (error) {
      logger.error('Verify controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = await this.storageService.getStatus();
      
      res.status(200).json({
        success: true,
        status,
      });
    } catch (error) {
      logger.error('Status controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  getMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = this.storageService.getMetrics();
      
      res.status(200).json({
        success: true,
        metrics,
      });
    } catch (error) {
      logger.error('Metrics controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  getCostEstimate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { size, tier = 'standard', duration } = req.query;
      
      if (!size || isNaN(Number(size))) {
        res.status(400).json({
          success: false,
          error: 'Valid size parameter is required',
        });
        return;
      }

      const estimates = await this.storageService.getCostEstimate(
        Number(size),
        tier as any,
        duration ? Number(duration) : undefined
      );
      
      res.status(200).json({
        success: true,
        size: Number(size),
        tier,
        duration: duration ? Number(duration) : undefined,
        estimates,
      });
    } catch (error) {
      logger.error('Cost estimate controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
