import { Request, Response } from "express";
export declare const createChannel: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getChannels: (req: Request, res: Response) => Promise<void>;
export declare const getChannelById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPublicChannels: (req: Request, res: Response) => Promise<void>;
export declare const joinChannel: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const addMembersToChannel: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
