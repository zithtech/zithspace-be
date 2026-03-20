export interface InvoiceTemplateFieldDto {
  id?: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  fieldOrder: number;
  isRequired?: boolean;
  isSystem?: boolean;
  options?: string[];
}

export interface CreateInvoiceTemplateDto {
  name: string;
  description?: string;
  billingType: string;
  isDefault?: boolean;
  isActive?: boolean;
  fields: InvoiceTemplateFieldDto[];
}

export interface UpdateInvoiceTemplateDto {
  name?: string;
  description?: string;
  billingType?: string;
  isDefault?: boolean;
  isActive?: boolean;
  fields?: InvoiceTemplateFieldDto[];
}
