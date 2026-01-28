import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { cacheService } from '../utils/cacheService.js';

const prisma = new PrismaClient();

/**
 * Get development info for a ticket
 * GET /api/tickets/:ticketId/development-info
 */
export const getDevelopmentInfo = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const tenantId = (req as any).tenantId;

    // Verify ticket belongs to tenant
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        tenantId,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const developmentInfo = await prisma.ticketDevelopmentInfo.findUnique({
      where: {
        ticketId,
      },
    });

    res.json(developmentInfo || null);
  } catch (error: any) {
    console.error('Error fetching development info:', error);
    res.status(500).json({ error: 'Failed to fetch development info' });
  }
};

/**
 * Update development info for a ticket
 * PUT /api/tickets/:ticketId/development-info
 */
export const updateDevelopmentInfo = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const tenantId = (req as any).tenantId;
    const { repositoryName, repositoryUrl, branchName } = req.body;

    // Verify ticket belongs to tenant
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        tenantId,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Upsert development info
    const developmentInfo = await prisma.ticketDevelopmentInfo.upsert({
      where: {
        ticketId,
      },
      update: {
        repositoryName,
        repositoryUrl,
        branchName,
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        ticketId,
        repositoryName,
        repositoryUrl,
        branchName,
      },
    });

    // Invalidate caches
    await cacheService.invalidateTicket(ticketId, tenantId);

    res.json(developmentInfo);
  } catch (error: any) {
    console.error('Error updating development info:', error);
    res.status(500).json({ error: 'Failed to update development info' });
  }
};

/**
 * Get all pull requests for a ticket
 * GET /api/tickets/:ticketId/pull-requests
 */
export const getPullRequests = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const tenantId = (req as any).tenantId;

    // Verify ticket belongs to tenant
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        tenantId,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const pullRequests = await prisma.ticketPullRequest.findMany({
      where: {
        ticketId,
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(pullRequests);
  } catch (error: any) {
    console.error('Error fetching pull requests:', error);
    res.status(500).json({ error: 'Failed to fetch pull requests' });
  }
};

/**
 * Create a new pull request
 * POST /api/tickets/:ticketId/pull-requests
 */
export const createPullRequest = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const tenantId = (req as any).tenantId;
    const { title, url, prNumber, status } = req.body;

    // Validate required fields
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }

    // Verify ticket belongs to tenant
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        tenantId,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const pullRequest = await prisma.ticketPullRequest.create({
      data: {
        tenantId,
        ticketId,
        title,
        url,
        prNumber: prNumber || null,
        status: status || 'open',
      },
    });

    // Invalidate caches
    await cacheService.invalidateTicket(ticketId, tenantId);

    res.status(201).json(pullRequest);
  } catch (error: any) {
    console.error('Error creating pull request:', error);
    res.status(500).json({ error: 'Failed to create pull request' });
  }
};

/**
 * Update a pull request
 * PUT /api/tickets/:ticketId/pull-requests/:prId
 */
export const updatePullRequest = async (req: Request, res: Response) => {
  try {
    const { ticketId, prId } = req.params;
    const tenantId = (req as any).tenantId;
    const { title, url, prNumber, status } = req.body;

    // Verify PR belongs to ticket and tenant
    const existingPR = await prisma.ticketPullRequest.findFirst({
      where: {
        id: prId,
        ticketId,
        tenantId,
      },
    });

    if (!existingPR) {
      return res.status(404).json({ error: 'Pull request not found' });
    }

    const pullRequest = await prisma.ticketPullRequest.update({
      where: {
        id: prId,
      },
      data: {
        title,
        url,
        prNumber: prNumber === null ? null : prNumber,
        status,
        updatedAt: new Date(),
      },
    });

    // Invalidate caches
    await cacheService.invalidateTicket(ticketId, tenantId);

    res.json(pullRequest);
  } catch (error: any) {
    console.error('Error updating pull request:', error);
    res.status(500).json({ error: 'Failed to update pull request' });
  }
};

/**
 * Delete a pull request
 * DELETE /api/tickets/:ticketId/pull-requests/:prId
 */
export const deletePullRequest = async (req: Request, res: Response) => {
  try {
    const { ticketId, prId } = req.params;
    const tenantId = (req as any).tenantId;

    // Verify PR belongs to ticket and tenant
    const existingPR = await prisma.ticketPullRequest.findFirst({
      where: {
        id: prId,
        ticketId,
        tenantId,
      },
    });

    if (!existingPR) {
      return res.status(404).json({ error: 'Pull request not found' });
    }

    await prisma.ticketPullRequest.delete({
      where: {
        id: prId,
      },
    });

    // Invalidate caches
    await cacheService.invalidateTicket(ticketId, tenantId);

    res.json({ message: 'Pull request deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting pull request:', error);
    res.status(500).json({ error: 'Failed to delete pull request' });
  }
};
