import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(private prisma: PrismaService) {}

  async createAuction(invoiceId: string, durationHours: number = 24) {
    this.logger.log(`Creating auction for invoice: ${invoiceId}`);

    const invoice = await (this.prisma as any).invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!invoice.isVerified) {
      throw new BadRequestException('Invoice must be verified before auction');
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

    const auction = await (this.prisma as any).auction.create({
      data: {
        invoiceId,
        startAmount: invoice.amount,
        startTime,
        endTime,
        minAdvanceRate: 80,
        maxAdvanceRate: 95,
        status: 'ACTIVE',
      },
    });

    // Update invoice status
    await (this.prisma as any).invoice.update({
      where: { id: invoiceId },
      data: { 
        status: 'IN_AUCTION',
        auctionId: auction.id,
      },
    });

    this.logger.log(`Auction created: ${auction.id}`);
    return auction;
  }

  async placeBid(auctionId: string, investorId: string, advanceRate: number) {
    this.logger.log(`Placing bid for auction: ${auctionId} by investor: ${investorId}`);

    const auction = await (this.prisma as any).auction.findUnique({
      where: { id: auctionId },
      include: { invoice: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    if (auction.status !== 'ACTIVE') {
      throw new BadRequestException('Auction is not active');
    }

    if (new Date() > auction.endTime) {
      throw new BadRequestException('Auction has ended');
    }

    if (advanceRate < auction.minAdvanceRate || advanceRate > auction.maxAdvanceRate) {
      throw new BadRequestException('Advance rate outside allowed range');
    }

    const discountRate = (100 - advanceRate) / 100;
    const advanceAmount = auction.invoice.amount * (advanceRate / 100);
    const expectedReturn = auction.invoice.amount;

    // Check if investor already has a bid
    const existingBid = await (this.prisma as any).bid.findFirst({
      where: {
        auctionId,
        investorId,
      },
    });

    if (existingBid) {
      // Update existing bid
      const updatedBid = await (this.prisma as any).bid.update({
        where: { id: existingBid.id },
        data: {
          advanceRate,
          discountRate,
          advanceAmount,
          expectedReturn,
        },
      });

      // Update auction if this is now the best bid
      await this.updateBestBid(auctionId, advanceRate, investorId);
      
      return updatedBid;
    } else {
      // Create new bid
      const bid = await (this.prisma as any).bid.create({
        data: {
          auctionId,
          invoiceId: auction.invoiceId,
          investorId,
          advanceRate,
          discountRate,
          advanceAmount,
          expectedReturn,
        },
      });

      // Update auction if this is the first or best bid
      await this.updateBestBid(auctionId, advanceRate, investorId);
      
      return bid;
    }
  }

  private async updateBestBid(auctionId: string, advanceRate: number, investorId: string) {
    const currentBest = await (this.prisma as any).auction.findUnique({
      where: { id: auctionId },
      select: { currentBestBid: true, currentBestBidder: true },
    });

    // Higher advance rate = lower discount = better for seller
    const isNewBest = !currentBest.currentBestBid || advanceRate > currentBest.currentBestBid;

    if (isNewBest) {
      await (this.prisma as any).auction.update({
        where: { id: auctionId },
        data: {
          currentBestBid: advanceRate,
          currentBestBidder: investorId,
        },
      });

      // Mark previous winning bid as not winning
      if (currentBest.currentBestBidder) {
        await (this.prisma as any).bid.updateMany({
          where: {
            auctionId,
            investorId: currentBest.currentBestBidder,
          },
          data: { isWinning: false },
        });
      }

      // Mark new winning bid
      await (this.prisma as any).bid.updateMany({
        where: {
          auctionId,
          investorId,
        },
        data: { isWinning: true },
      });
    }
  }

  async endAuction(auctionId: string) {
    this.logger.log(`Ending auction: ${auctionId}`);

    const auction = await (this.prisma as any).auction.findUnique({
      where: { id: auctionId },
      include: {
        bids: {
          orderBy: { advanceRate: 'desc' },
          take: 1,
        },
      },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    if (auction.status !== 'ACTIVE') {
      throw new BadRequestException('Auction is not active');
    }

    const winningBid = auction.bids[0];
    
    const updatedAuction = await (this.prisma as any).auction.update({
      where: { id: auctionId },
      data: {
        status: 'ENDED',
        winningBidId: winningBid?.id || null,
      },
    });

    if (winningBid) {
      // Update invoice status to funded
      await (this.prisma as any).invoice.update({
        where: { id: auction.invoiceId },
        data: { status: 'FUNDED' },
      });

      this.logger.log(`Auction won by investor: ${winningBid.investorId}`);
    } else {
      // No bids, return invoice to verified status
      await (this.prisma as any).invoice.update({
        where: { id: auction.invoiceId },
        data: { status: 'VERIFIED' },
      });

      this.logger.log(`Auction ended with no bids`);
    }

    return updatedAuction;
  }

  async getAuctionById(auctionId: string) {
    return this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        invoice: {
          include: {
            seller: {
              select: {
                id: true,
                walletAddress: true,
                reputationScore: true,
              },
            },
          },
        },
        bids: {
          include: {
            investor: {
              select: {
                id: true,
                walletAddress: true,
                reputationScore: true,
              },
            },
          },
          orderBy: { advanceRate: 'desc' },
        },
      },
    });
  }

  async getActiveAuctions() {
    return (this.prisma as any).auction.findMany({
      where: {
        status: 'ACTIVE',
        endTime: { gt: new Date() },
      },
      include: {
        invoice: {
          include: {
            seller: {
              select: {
                id: true,
                walletAddress: true,
                reputationScore: true,
              },
            },
          },
        },
        bids: {
          include: {
            investor: {
              select: {
                id: true,
                walletAddress: true,
                reputationScore: true,
              },
            },
          },
          orderBy: { advanceRate: 'desc' },
        },
      },
      orderBy: { endTime: 'asc' },
    });
  }
}
