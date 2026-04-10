-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_documentHubId_fkey" FOREIGN KEY ("documentHubId") REFERENCES "document_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "documenttree" ADD CONSTRAINT "documenttree_documentHubId_fkey" FOREIGN KEY ("documentHubId") REFERENCES "document_hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "documenttree" ADD CONSTRAINT "documenttree_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "origin_leave_types" ADD CONSTRAINT "origin_leave_types_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_addresses" ADD CONSTRAINT "employee_addresses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_emergency_contacts" ADD CONSTRAINT "employee_emergency_contacts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_identities" ADD CONSTRAINT "employee_identities_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_work_details" ADD CONSTRAINT "employee_work_details_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_timelines" ADD CONSTRAINT "employee_timelines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_project_mappings" ADD CONSTRAINT "employee_project_mappings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_additional_details" ADD CONSTRAINT "employee_additional_details_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_bank_details" ADD CONSTRAINT "employee_bank_details_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_payroll_details" ADD CONSTRAINT "employee_payroll_details_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "employee_assets" ADD CONSTRAINT "employee_assets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "invoice_template_fields" ADD CONSTRAINT "invoice_template_fields_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "invoice_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_recruitment_client_id_fkey" FOREIGN KEY ("recruitment_client_id") REFERENCES "recruitment_client_basic_information"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_delivery_manager_id_fkey" FOREIGN KEY ("delivery_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "job_requisition_contacts" ADD CONSTRAINT "job_requisition_contacts_job_requisition_id_fkey" FOREIGN KEY ("job_requisition_id") REFERENCES "job_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "vendor_contact_person" ADD CONSTRAINT "vendor_contact_person_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor-basic-information"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "vendor_business_detailes" ADD CONSTRAINT "vendor_business_detailes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor-basic-information"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "vendor_relations" ADD CONSTRAINT "vendor_relations_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor-basic-information"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "vendor_document" ADD CONSTRAINT "vendor_document_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor-basic-information"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "reimbursement_items" ADD CONSTRAINT "reimbursement_items_reimbursement_id_fkey" FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursements"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_reimbursement_item_id_fkey" FOREIGN KEY ("reimbursement_item_id") REFERENCES "reimbursement_items"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "reimbursement_policy_rules" ADD CONSTRAINT "reimbursement_policy_rules_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "reimbursement_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "reimbursement_policy_approvers" ADD CONSTRAINT "reimbursement_policy_approvers_policy_rule_id_fkey" FOREIGN KEY ("policy_rule_id") REFERENCES "reimbursement_policy_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "exit_types" ADD CONSTRAINT "exit_types_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "exit_types" ADD CONSTRAINT "exit_types_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "reasons_for_exit" ADD CONSTRAINT "reasons_for_exit_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "reasons_for_exit" ADD CONSTRAINT "reasons_for_exit_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "recruitment_statuses" ADD CONSTRAINT "recruitment_statuses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "recruitment_statuses" ADD CONSTRAINT "recruitment_statuses_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "recruitment_actions" ADD CONSTRAINT "recruitment_actions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "recruitment_actions" ADD CONSTRAINT "recruitment_actions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "candidate_work_experiences" ADD CONSTRAINT "candidate_work_experiences_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "candidate_skill_matrices" ADD CONSTRAINT "candidate_skill_matrices_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "candidate_educations" ADD CONSTRAINT "candidate_educations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "candidate_interview_slots" ADD CONSTRAINT "candidate_interview_slots_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "salary_payouts" ADD CONSTRAINT "salary_payouts_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "salary_approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

