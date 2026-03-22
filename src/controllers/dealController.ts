import { Request, Response } from "express";
import { prisma, tenantAwarePrisma } from "@/config/database";
import dayjs from "dayjs";
import { Employee } from "@prisma/client";

export class DealController {
  // Create a new deal
  static async createDeal(req: Request, res: Response) {
    try {
      const {
        clientName,
        companyName,
        email,
        phone,
        title,
        stageId,
        assignedToId,
        assigneeIds, // New field for multi-select
        estimatedValue,
        currency,
        expectedClosingDate,
        probability,
        source,
        tags,
        notes,
        status
      } = req.body;
      const tenantId = (req as any).tenantId;

      if (!tenantId) {
        return res.status(400).json({ success: false, error: "Tenant context missing" });
      }

      // 1. Get stage probability if not provided
      let finalProbability = probability ? Number(probability) : null;
      if (finalProbability === null) {
        const stage = await prisma.pipelineStage.findUnique({
          where: { id: stageId }
        });
        finalProbability = stage?.probability ?? 0;
      }

      // 2. If status is Won, overwrite to 100
      if (status === 'Won') {
        finalProbability = 100;
      }

      const deal = await prisma.deal.create({
        data: {
          tenantId,
          clientName,
          companyName: companyName || null,
          email: email || null,
          phone: phone || null,
          title,
          stageId,
          assignedToId: (assignedToId && assignedToId !== "") ? assignedToId : null,
          estimatedValue: estimatedValue ? Number(estimatedValue) : null,
          currency: currency || "USD",
          expectedClosingDate: expectedClosingDate ? new Date(expectedClosingDate) : null,
          probability: finalProbability,
          source: source || null,
          tags: Array.isArray(tags) ? tags : [],
          notes: notes || null,
          status: status || "Active",
          // 3. Handle multi-assignees
          assignees: (assigneeIds && Array.isArray(assigneeIds)) ? {
            create: assigneeIds.map((userId: string) => ({
              userId
            }))
          } : undefined
        },
        include: {
          stage: true,
          assignedTo: true,
          assignees: {
            include: {
              user: true
            }
          }
        }
      });

      res.status(201).json({ success: true, data: deal });
    } catch (error: any) {
      console.error("Error creating deal:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to create deal", 
        details: error.message || String(error)
      });
    }
  }

  // Get all deals for the tenant
  static async getAllDeals(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenantId;

      if (!tenantId) {
        return res.status(400).json({ success: false, error: "Tenant context missing" });
      }

      const deals = await prisma.deal.findMany({
        where: { tenantId },
        include: {
          stage: true,
          assignedTo: true,
          assignees: {
            include: {
              user: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({ success: true, data: deals });
    } catch (error: any) {
      console.error("Error fetching deals:", error);
      res.status(500).json({ success: false, error: "Failed to fetch deals" });
    }
  }

  // Get a single deal
  static async getDealById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = (req as any).tenantId;

      const deal = await prisma.deal.findFirst({
        where: { id, tenantId },
        include: {
          stage: true,
          assignedTo: true,
          assignees: {
            include: {
              user: true
            }
          }
        }
      });

      if (!deal) {
        return res.status(404).json({ success: false, error: "Deal not found" });
      }

      res.status(200).json({ success: true, data: deal });
    } catch (error: any) {
      console.error("Error fetching deal:", error);
      res.status(500).json({ success: false, error: "Failed to fetch deal" });
    }
  }

  // Update a deal
  static async updateDeal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = (req as any).tenantId;
      let updateData = req.body;

      // 1. If stageId changed and probability not provided, sync it
      if (updateData.stageId && updateData.probability === undefined) {
        const stage = await prisma.pipelineStage.findUnique({
          where: { id: updateData.stageId }
        });
        if (stage) {
          updateData.probability = stage.probability;
        }
      }

      // 2. If status changed to Won, set probability to 100
      if (updateData.status === 'Won') {
        updateData.probability = 100;
      }

      if (updateData.expectedClosingDate) {
        updateData.expectedClosingDate = new Date(updateData.expectedClosingDate);
      }

      if (updateData.assigneeIds) {
        const { assigneeIds, ...rest } = updateData;
        const updated = await prisma.deal.update({
          where: { id, tenantId },
          data: {
            ...rest,
            assignees: {
              deleteMany: {},
              create: assigneeIds.map((userId: string) => ({
                userId
              }))
            }
          },
          include: {
            stage: true,
            assignedTo: true,
            assignees: {
              include: {
                user: true
              }
            }
          }
        });
        return res.status(200).json({ success: true, data: updated });
      }

      const updated = await prisma.deal.update({
        where: { id, tenantId },
        data: updateData,
        include: {
          stage: true,
          assignedTo: true,
          assignees: {
            include: {
              user: true
            }
          }
        }
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      console.error("Error updating deal:", error);
      res.status(500).json({ success: false, error: "Failed to update deal" });
    }
  }

  // Delete a deal
  static async deleteDeal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = (req as any).tenantId;

      await prisma.deal.delete({
        where: { id, tenantId }
      });

      res.status(200).json({ success: true, message: "Deal deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting deal:", error);
      res.status(500).json({ success: false, error: "Failed to delete deal" });
    }
  }

  // Convert deal to project
  static async convertToProject(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { 
        name, 
        code, 
        description, 
        startDate, 
        endDate, 
        projectManagerId, 
        defaultPriority,
        clientId,
        billingType,
        budget,
        memberIds
      } = req.body;
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id;

      if (!tenantId || !userId) {
        return res.status(400).json({ success: false, error: "Tenant context or user missing" });
      }

      if (!name || !projectManagerId) {
        return res.status(400).json({ success: false, error: "Project name and Project Manager are required" });
      }

      const result = await tenantAwarePrisma.withTenant(tenantId, async (prismaClient) => {
        return await (prismaClient as any).$transaction(async (tx: any) => {
          // 1. Get the deal details
          const deal = await tx.deal.findFirst({
            where: { id, tenantId },
          });

          if (!deal) {
            throw new Error("Deal not found");
          }

          // 2. Create the project
          const project = await tx.project.create({
            data: {
              tenantId: tenantId as any,
              name,
              code: code || `PRJ-${deal.id.substring(0, 8).toUpperCase()}`,
              description: description || deal.notes || `Project converted from deal: ${deal.title}`,
              status: 'active',
              startDate: startDate ? new Date(startDate) : new Date(),
              endDate: endDate ? new Date(endDate) : null,
              projectManagerId,
              createdById: userId as any,
              defaultPriority: defaultPriority || 'medium'
            } as any
          });

          // 3. Add members if provided
          if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
            await tx.projectMember.createMany({
              data: memberIds.map((mid: string) => ({
                projectId: project.id,
                userId: mid,
                role: 'member'
              }))
            });
          }

          // 4. Create mapping if clientId exists
          if (clientId) {
            await tx.clientProject.create({
              data: {
                tenantId,
                clientId,
                projectId: project.id,
                billingType: billingType || 'Fixed',
                budget: budget ? Number(budget) : deal.estimatedValue
              }
            });
          }

          // 4. Update deal status to Won and probability to 100
          await tx.deal.update({
            where: { id },
            data: { 
              status: 'Won',
              probability: 100
            }
          });

          return { project, clientId };
        });
      });

      res.status(200).json({ 
        success: true, 
        data: result, 
        message: "Deal successfully converted to project and marked as Won" 
      });
    } catch (error: any) {
      console.error("Error converting deal to project:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message === "Deal not found" ? "Deal not found" : "Failed to convert deal to project",
        details: error.message || String(error)
      });
    }
  }

  // Get Forecast Data
  static async getForecastData(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: "Tenant context missing" });
      }

      const { startDate, endDate, stageId, assignedToId } = req.query;

      // Build filters
      const where: any = { tenantId };
      if (startDate && endDate) {
        where.expectedClosingDate = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        };
      }
      if (stageId) where.stageId = stageId as string;
      if (assignedToId) where.assignedToId = assignedToId as string;

      // Fetch all deals matching filters
      const deals = await prisma.deal.findMany({
        where,
        include: {
          stage: true,
          assignedTo: true
        }
      });

      // Calculate Metrics
      let totalPipelineValue = 0;
      let weightedRevenue = 0;
      let wonRevenue = 0;
      let lostRevenue = 0;

      deals.forEach(deal => {
        const val = Number(deal.estimatedValue || 0);
        const prob = Number(deal.probability || 0);
        
        // Pipeline includes all non-terminal deals
        if (deal.status === 'Active' && deal.stage?.name !== 'Closed Won' && deal.stage?.name !== 'Closed Lost') {
          totalPipelineValue += val;
          weightedRevenue += (val * prob) / 100;
        }

        if (deal.stage?.name === 'Closed Won' || deal.status === 'Won') {
          wonRevenue += val;
        } else if (deal.stage?.name === 'Closed Lost' || deal.status === 'Lost') {
          lostRevenue += val;
        }
      });

      // Group by Stage
      const revenueByStage = deals.reduce((acc: any[], deal) => {
        const stageName = deal.stage?.name || 'Unknown';
        const existing = acc.find(a => a.stage === stageName);
        if (existing) {
          existing.value += Number(deal.estimatedValue || 0);
          existing.count += 1;
        } else {
          acc.push({ stage: stageName, value: Number(deal.estimatedValue || 0), count: 1 });
        }
        return acc;
      }, []);

      // Monthly Forecast (Weighted)
      const monthlyForecast = deals.reduce((acc: any[], deal) => {
        if (!deal.expectedClosingDate) return acc;
        const month = dayjs(deal.expectedClosingDate).format('MMM YYYY');
        const weightedVal = (Number(deal.estimatedValue || 0) * Number(deal.probability || 0)) / 100;
        
        const existing = acc.find(a => a.month === month);
        if (existing) {
          existing.value += weightedVal;
        } else {
          acc.push({ month, value: weightedVal });
        }
        return acc;
      }, []).sort((a: any, b: any) => dayjs(a.month, 'MMM YYYY').unix() - dayjs(b.month, 'MMM YYYY').unix());

      res.status(200).json({
        success: true,
        data: {
          metrics: {
            totalPipelineValue,
            weightedRevenue,
            wonRevenue,
            lostRevenue
          },
          charts: {
            revenueByStage,
            monthlyForecast
          },
          deals: deals.map(d => ({
            id: d.id,
            title: d.title,
            value: d.estimatedValue,
            probability: d.probability,
            weightedValue: (Number(d.estimatedValue || 0) * Number(d.probability || 0)) / 100,
            stage: d.stage?.name,
            assignedTo: d.assignedTo ? `${d.assignedTo.first_name} ${d.assignedTo.last_name}` : 'Unassigned'
          }))
        }
      });
    } catch (error: any) {
      console.error("Error fetching forecast data:", error);
      res.status(500).json({ success: false, error: "Failed to fetch forecast data" });
    }
  }
}
