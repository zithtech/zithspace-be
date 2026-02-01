import { Request, Response } from "express";
export declare const createMessage: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getMessages: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
