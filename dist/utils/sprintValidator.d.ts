import { ReleasePlan } from "@prisma/client";
/**
 * Sprint Validator - Enforces sprint lifecycle rules
 *
 * Rules:
 * 1. Only ONE active sprint per project at a time
 * 2. Cannot create new sprint if active sprint exists
 * 3. Cannot start sprint if another is active
 * 4. Must complete current sprint before starting new one
 * 5. Demo/Release plans are independent (no restrictions)
 */
export declare class SprintValidator {
    /**
     * Check if project has an active sprint
     */
    static hasActiveSprint(projectId: string, tenantId: string): Promise<boolean>;
    /**
     * Get active sprint for project
     */
    static getActiveSprint(projectId: string, tenantId: string): Promise<(ReleasePlan & {
        tickets: Array<{
            id: string;
            ticketNumber: string;
            title: string;
            status: string;
            storyPoint: number;
            priority: string;
            assignee?: {
                id: string;
                name: string;
                workEmail: string;
            } | null;
        }>;
    }) | null>;
    /**
     * Validate if new sprint can be created
     */
    static validateNewSprint(projectId: string, tenantId: string): Promise<{
        valid: boolean;
        error?: string;
        activeSprint?: ReleasePlan;
    }>;
    /**
     * Validate if sprint can be started
     */
    static validateStartSprint(sprintId: string, projectId: string, tenantId: string): Promise<{
        valid: boolean;
        error?: string;
        sprint?: ReleasePlan;
    }>;
    /**
     * Validate if sprint can be completed
     */
    static validateCompleteSprint(sprintId: string, tenantId: string): Promise<{
        valid: boolean;
        error?: string;
        sprint?: ReleasePlan;
    }>;
    /**
     * Calculate sprint metrics
     */
    static calculateSprintMetrics(sprintId: string, tenantId: string): Promise<{
        totalTickets: number;
        completedTickets: number;
        inProgressTickets: number;
        notStartedTickets: number;
        totalPoints: number;
        completedPoints: number;
        inProgressPoints: number;
        progress: number;
    }>;
    /**
     * Get sprint velocity (average story points from last N completed sprints)
     */
    static getProjectVelocity(projectId: string, tenantId: string, lastNSprints?: number): Promise<{
        avgVelocity: number;
        sprints: {
            name: string;
            completedPoints: number;
            committedPoints: number;
            startDate: Date;
            endDate: Date;
        }[];
        totalSprints: number;
    }>;
}
