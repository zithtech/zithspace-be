-- Update pa_agreement_unlock_sessions_password_scope_check to allow 'TEMPLATE' scope
ALTER TABLE pa_agreement_unlock_sessions 
  DROP CONSTRAINT IF EXISTS pa_agreement_unlock_sessions_password_scope_check;

ALTER TABLE pa_agreement_unlock_sessions 
  ADD CONSTRAINT pa_agreement_unlock_sessions_password_scope_check 
  CHECK (password_scope IN ('TENANT', 'AGREEMENT', 'TEMPLATE'));
