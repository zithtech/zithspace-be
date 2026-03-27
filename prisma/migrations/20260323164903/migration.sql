-- Calculation Type
CREATE TYPE calculation_type AS ENUM (
  'FIXED',
  'PERCENTAGE'
);

-- Percentage Basis
CREATE TYPE percentage_basis AS ENUM (
  'GROSS',
  'BASIC'
);

CREATE TABLE salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,

  employee_type TEXT ,

  gross_salary NUMERIC(12,2) ,
  effective_from TIMESTAMP ,

  description TEXT,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- FK
  CONSTRAINT fk_salary_structures_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE
);


CREATE TABLE salary_structure_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  structure_id UUID NOT NULL,
  component_id INT NOT NULL,

  calculation_type calculation_type NOT NULL,
  percentage_basis percentage_basis,

  value NUMERIC(12,2) NOT NULL,
  calculated_amount NUMERIC(12,2),

  display_order INT,

  -- FK: structure
  CONSTRAINT fk_structure
    FOREIGN KEY (structure_id)
    REFERENCES salary_structures(id)
    ON DELETE CASCADE,

  -- FK: salary component
  CONSTRAINT fk_component
    FOREIGN KEY (component_id)
    REFERENCES salary_components(key)
);

-- For faster queries
CREATE INDEX idx_salary_structure_tenant 
ON salary_structures(tenant_id);

CREATE INDEX idx_structure_component_structure 
ON salary_structure_components(structure_id);

CREATE INDEX idx_structure_component_component 
ON salary_structure_components(component_id);