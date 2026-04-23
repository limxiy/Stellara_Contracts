import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // For now, just return true to allow requests
    // In production, implement proper JWT validation
    const request = context.switchToHttp().getRequest();
    request.user = { id: 'temp-user-id' }; // Temporary mock user
    return true;
  }
}
