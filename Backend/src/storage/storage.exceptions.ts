/**
 * Custom exceptions for storage service operations
 */

export class IPFSConnectionError extends Error {
  constructor(message: string) {
    super(`IPFS Connection Error: ${message}`);
    this.name = 'IPFSConnectionError';
  }
}

export class IPFSPinningError extends Error {
  constructor(message: string) {
    super(`IPFS Pinning Error: ${message}`);
    this.name = 'IPFSPinningError';
  }
}

export class ImageOptimizationError extends Error {
  constructor(message: string) {
    super(`Image Optimization Error: ${message}`);
    this.name = 'ImageOptimizationError';
  }
}

export class IPFSVerificationError extends Error {
  constructor(message: string) {
    super(`IPFS Verification Error: ${message}`);
    this.name = 'IPFSVerificationError';
  }
}
