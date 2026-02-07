import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class BucketController {
    /**
     * Get all buckets for a tenant/project (tenant-aware)
     */
    static getBuckets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get paginated tickets in a bucket (tenant-aware)
     */
    static getBucketTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get bucket by ID with detailed ticket information (tenant-aware)
     */
    static getBucketById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create a new bucket (tenant-aware)
     */
    static createBucket(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update bucket (tenant-aware)
     */
    static updateBucket(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete bucket (tenant-aware)
     * Removes bucket and unassigns all tickets from it
     */
    static deleteBucket(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Add member to shared bucket (tenant-aware)
     */
    static addBucketMember(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Remove member from shared bucket (tenant-aware)
     */
    static removeBucketMember(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Assign tickets to bucket (tenant-aware)
     */
    static assignTicketsToBucket(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Unassign tickets from bucket (tenant-aware)
     */
    static unassignTicketsFromBucket(req: AuthRequest, res: Response): Promise<void>;
}
