import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  createCorrelationId() {
    return randomUUID();
  }

  async track(event: string, contract: string, correlationId: string) {
    return this.prisma.eventFlow.create({
      data: { event, contract, correlationId },
    });
  }

  async getFlow(correlationId: string) {
    return this.prisma.eventFlow.findMany({
      where: { correlationId },
    });
  }
}