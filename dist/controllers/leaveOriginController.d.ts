import { Request, Response } from "express";
export declare const createLeaveOriginStructure: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateLeaveOriginStructure: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createOriginLeaveType: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAllLeaveOrigins: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteLeaveOriginStructure: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteOriginLeaveType: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateOriginLeaveType: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
