import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { StorageGatewayService } from '@/services/storage-gateway';
import { StorageController } from '@/controllers/storage';
import routes from '@/routes';
import { setStorageController } from '@/routes';
import config from '@/config';
import logger from '@/utils/logger';

class StorageGatewayApp {
  private app: express.Application;
  private storageService!: StorageGatewayService;
  private storageController!: StorageController;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.initializeServices();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // CORS - using basic configuration to avoid TypeScript issues
    this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.header('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  private async initializeServices(): Promise<void> {
    try {
      this.storageService = new StorageGatewayService();
      this.storageController = new StorageController(this.storageService);
      
      // Set controller in routes
      setStorageController(this.storageController);
      
      logger.info('Storage services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize storage services:', error);
      throw error;
    }
  }

  private setupRoutes(): void {
    // Dashboard route
    if (config.dashboard.enabled) {
      this.app.get('/dashboard', (req, res) => {
        const dashboardPath = __dirname + '/dashboard/index.html';
        res.sendFile(dashboardPath);
      });
    }

    // API routes
    this.app.use('/api/v1', routes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Stellara Storage Gateway API',
        version: '1.0.0',
        endpoints: {
          upload: '/api/v1/upload',
          uploadFile: '/api/v1/upload/file',
          retrieve: '/api/v1/retrieve',
          pin: '/api/v1/pin',
          verify: '/api/v1/verify',
          status: '/api/v1/status',
          metrics: '/api/v1/metrics',
          costEstimate: '/api/v1/cost-estimate',
          health: '/api/v1/health',
          dashboard: config.dashboard.enabled ? '/dashboard' : 'disabled',
        },
        documentation: 'https://docs.stellara.ai/storage-gateway',
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);

      if (res.headersSent) {
        return next(error);
      }

      res.status(error.status || 500).json({
        success: false,
        error: 'Internal server error',
        message: config.server.nodeEnv === 'development' ? error.message : undefined,
        ...(config.server.nodeEnv === 'development' && { stack: error.stack }),
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: any) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: any) => {
      logger.error('Uncaught Exception:', error);
      this.gracefulShutdown('SIGTERM');
    });

    // Handle termination signals
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Cleanup services
      if (this.storageService) {
        await this.storageService.cleanup();
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  public start(): void {
    this.app.listen(config.server.port, () => {
      logger.info(`Storage Gateway server started on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      logger.info(`API available at: http://localhost:${config.server.port}/api/v1`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Start the application
const app = new StorageGatewayApp();
app.start();

export default app;
