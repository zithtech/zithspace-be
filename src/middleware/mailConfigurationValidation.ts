import { Request, Response, NextFunction } from 'express';
import { MailProvider } from '../models/mailConfiguration.model';

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * UUID validation regex
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validation error interface
 */
interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Validate mail configuration fields
 */
export const validateMailConfiguration = (req: Request, res: Response, next: NextFunction) => {
  const errors: ValidationError[] = [];
  const { provider, email, smtpHost, smtpPort, smtpUsername, smtpPassword, defaultFromEmail, enableSsl, isActive, metadata } = req.body;

  // Provider validation
  if (!provider) {
    errors.push({ field: 'provider', message: 'Provider is required' });
  } else if (!Object.values(MailProvider).includes(provider)) {
    errors.push({ field: 'provider', message: 'Provider must be one of: GOOGLE, MICROSOFT, ZOHO' });
  }

  // Email validation
  if (!email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push({ field: 'email', message: 'Valid email address is required', value: email });
  }

  // SMTP host validation
  if (!smtpHost) {
    errors.push({ field: 'smtpHost', message: 'SMTP host is required' });
  } else if (typeof smtpHost !== 'string') {
    errors.push({ field: 'smtpHost', message: 'SMTP host must be a string' });
  } else if (smtpHost.length < 3 || smtpHost.length > 255) {
    errors.push({ field: 'smtpHost', message: 'SMTP host must be between 3 and 255 characters' });
  }

  // SMTP port validation
  if (!smtpPort) {
    errors.push({ field: 'smtpPort', message: 'SMTP port is required' });
  } else if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    errors.push({ field: 'smtpPort', message: 'SMTP port must be between 1 and 65535', value: smtpPort });
  }

  // SMTP username validation
  if (!smtpUsername) {
    errors.push({ field: 'smtpUsername', message: 'SMTP username is required' });
  } else if (typeof smtpUsername !== 'string') {
    errors.push({ field: 'smtpUsername', message: 'SMTP username must be a string' });
  } else if (smtpUsername.length < 1 || smtpUsername.length > 255) {
    errors.push({ field: 'smtpUsername', message: 'SMTP username must be between 1 and 255 characters' });
  }

  // SMTP password validation
  if (!smtpPassword) {
    errors.push({ field: 'smtpPassword', message: 'SMTP password is required' });
  } else if (typeof smtpPassword !== 'string') {
    errors.push({ field: 'smtpPassword', message: 'SMTP password must be a string' });
  } else if (smtpPassword.length < 1) {
    errors.push({ field: 'smtpPassword', message: 'SMTP password cannot be empty' });
  }

  // Default from email validation
  if (!defaultFromEmail) {
    errors.push({ field: 'defaultFromEmail', message: 'Default from email is required' });
  } else if (!EMAIL_REGEX.test(defaultFromEmail)) {
    errors.push({ field: 'defaultFromEmail', message: 'Valid default from email is required', value: defaultFromEmail });
  }

  // Optional fields validation
  if (enableSsl !== undefined && typeof enableSsl !== 'boolean') {
    errors.push({ field: 'enableSsl', message: 'Enable SSL must be a boolean', value: enableSsl });
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'Is active must be a boolean', value: isActive });
  }

  if (metadata !== undefined && typeof metadata !== 'object' && metadata !== null) {
    errors.push({ field: 'metadata', message: 'Metadata must be an object', value: metadata });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      data: null,
      errors
    });
  }

  next();
};

/**
 * Validate mail configuration update fields (all optional)
 */
export const validateMailConfigurationUpdate = (req: Request, res: Response, next: NextFunction) => {
  const errors: ValidationError[] = [];
  const { provider, email, smtpHost, smtpPort, smtpUsername, smtpPassword, defaultFromEmail, enableSsl, isActive, metadata } = req.body;

  // Provider validation (optional)
  if (provider !== undefined) {
    if (!Object.values(MailProvider).includes(provider)) {
      errors.push({ field: 'provider', message: 'Provider must be one of: GOOGLE, MICROSOFT, ZOHO' });
    }
  }

  // Email validation (optional)
  if (email !== undefined) {
    if (!EMAIL_REGEX.test(email)) {
      errors.push({ field: 'email', message: 'Valid email address is required', value: email });
    }
  }

  // SMTP host validation (optional)
  if (smtpHost !== undefined) {
    if (typeof smtpHost !== 'string') {
      errors.push({ field: 'smtpHost', message: 'SMTP host must be a string' });
    } else if (smtpHost.length < 3 || smtpHost.length > 255) {
      errors.push({ field: 'smtpHost', message: 'SMTP host must be between 3 and 255 characters' });
    }
  }

  // SMTP port validation (optional)
  if (smtpPort !== undefined) {
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      errors.push({ field: 'smtpPort', message: 'SMTP port must be between 1 and 65535', value: smtpPort });
    }
  }

  // SMTP username validation (optional)
  if (smtpUsername !== undefined) {
    if (typeof smtpUsername !== 'string') {
      errors.push({ field: 'smtpUsername', message: 'SMTP username must be a string' });
    } else if (smtpUsername.length < 1 || smtpUsername.length > 255) {
      errors.push({ field: 'smtpUsername', message: 'SMTP username must be between 1 and 255 characters' });
    }
  }

  // SMTP password validation (optional)
  if (smtpPassword !== undefined) {
    if (typeof smtpPassword !== 'string') {
      errors.push({ field: 'smtpPassword', message: 'SMTP password must be a string' });
    } else if (smtpPassword.length < 1) {
      errors.push({ field: 'smtpPassword', message: 'SMTP password cannot be empty' });
    }
  }

  // Default from email validation (optional)
  if (defaultFromEmail !== undefined) {
    if (!EMAIL_REGEX.test(defaultFromEmail)) {
      errors.push({ field: 'defaultFromEmail', message: 'Valid default from email is required', value: defaultFromEmail });
    }
  }

  // Optional fields validation
  if (enableSsl !== undefined && typeof enableSsl !== 'boolean') {
    errors.push({ field: 'enableSsl', message: 'Enable SSL must be a boolean', value: enableSsl });
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'Is active must be a boolean', value: isActive });
  }

  if (metadata !== undefined && typeof metadata !== 'object' && metadata !== null) {
    errors.push({ field: 'metadata', message: 'Metadata must be an object', value: metadata });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      data: null,
      errors
    });
  }

  next();
};

/**
 * Middleware to validate that at least one field is provided for updates
 */
export const validateAtLeastOneField = (req: Request, res: Response, next: NextFunction) => {
  const allowedFields = [
    'provider', 'email', 'smtpHost', 'smtpPort', 'smtpUsername', 
    'smtpPassword', 'enableSsl', 'defaultFromEmail', 'isActive', 'metadata'
  ];
  
  const hasAtLeastOneField = allowedFields.some(field => req.body[field] !== undefined);
  
  if (!hasAtLeastOneField) {
    return res.status(400).json({
      success: false,
      message: 'At least one field must be provided for update',
      data: null
    });
  }
  
  next();
};

/**
 * Middleware to validate mail configuration ID parameter
 */
export const validateMailConfigurationId = (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Mail configuration ID is required',
      data: null
    });
  }
  
  // Basic UUID format validation
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid mail configuration ID format',
      data: null
    });
  }
  
  next();
};

/**
 * Middleware to validate query parameters for listing mail configurations
 */
export const validateMailConfigurationQuery = (req: Request, res: Response, next: NextFunction) => {
  const { page, limit, provider, isActive, search, sortBy, sortOrder } = req.query;
  
  // Validate page
  if (page !== undefined) {
    const pageNum = parseInt(page as string);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be a positive integer',
        data: null
      });
    }
  }
  
  // Validate limit
  if (limit !== undefined) {
    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100',
        data: null
      });
    }
  }
  
  // Validate provider
  if (provider !== undefined) {
    if (!Object.values(MailProvider).includes(provider as MailProvider)) {
      return res.status(400).json({
        success: false,
        message: 'Provider must be one of: GOOGLE, MICROSOFT, ZOHO',
        data: null
      });
    }
  }
  
  // Validate isActive
  if (isActive !== undefined) {
    if (isActive !== 'true' && isActive !== 'false') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be true or false',
        data: null
      });
    }
  }
  
  // Validate search
  if (search !== undefined) {
    const searchStr = search as string;
    if (searchStr.length < 1 || searchStr.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Search term must be between 1 and 100 characters',
        data: null
      });
    }
  }
  
  // Validate sortOrder
  if (sortOrder !== undefined) {
    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      return res.status(400).json({
        success: false,
        message: 'Sort order must be asc or desc',
        data: null
      });
    }
  }
  
  next();
};
