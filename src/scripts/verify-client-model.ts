import pool from "../config/dbpool";
import {
  createClient,
  getClientById,
  getClientByEmail,
  updateClient,
  deleteClient,
  getClients,
  getClientStats,
  getClientsForSelect,
  bulkUpdateClientStatus,
  searchClients,
  countActiveClients
} from "../models/client.model";

async function runVerification() {
  console.log("=== STARTING RAW SQL CLIENT MODEL VERIFICATION ===");
  try {
    // 1. Fetch a tenant and a user to run the tests with
    const tenantResult = await pool.query("SELECT id FROM tenants LIMIT 1");
    if (tenantResult.rows.length === 0) {
      console.log("No tenants found in database. Cannot run tests.");
      return;
    }
    const tenantId = tenantResult.rows[0].id;
    console.log(`Using Tenant ID: ${tenantId}`);

    const userResult = await pool.query("SELECT id FROM users WHERE tenant_id = $1 LIMIT 1", [tenantId]);
    if (userResult.rows.length === 0) {
      console.log(`No users found for tenant ${tenantId}. Cannot run tests.`);
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`Using User ID: ${userId}`);

    // Generate unique email to avoid duplicates
    const randomSuffix = Math.floor(Math.random() * 10000);
    const testEmail = `test_client_${randomSuffix}@example.com`;
    const testName = `Test Client ${randomSuffix}`;

    // 2. Test createClient
    console.log("\nTesting createClient...");
    const newClient = await createClient(tenantId, userId, {
      name: testName,
      email: testEmail,
      phone: "123-456-7890",
      company: "Test Corp",
      address: "123 Test St",
      contactPerson: "John Doe",
      notes: "This is a test client"
    });
    console.log("Client created successfully:", {
      id: newClient.id,
      name: newClient.name,
      email: newClient.email,
      createdById: newClient.createdById,
      createdBy: newClient.createdBy
    });

    // 3. Test getClientById
    console.log("\nTesting getClientById...");
    const clientById = await getClientById(newClient.id, tenantId);
    if (!clientById) throw new Error("getClientById returned null");
    console.log("Fetched by ID successfully:", clientById.name);

    // 4. Test getClientByEmail
    console.log("\nTesting getClientByEmail...");
    const clientByEmail = await getClientByEmail(testEmail, tenantId);
    if (!clientByEmail) throw new Error("getClientByEmail returned null");
    console.log("Fetched by Email successfully:", clientByEmail.email);

    // 5. Test updateClient
    console.log("\nTesting updateClient...");
    const updatedClient = await updateClient(newClient.id, tenantId, {
      name: `${testName} Updated`,
      notes: "Updated test notes"
    });
    if (!updatedClient) throw new Error("updateClient returned null");
    console.log("Updated successfully:", {
      name: updatedClient.name,
      notes: updatedClient.notes
    });

    // 6. Test getClients (list)
    console.log("\nTesting getClients (listing)...");
    const listResult = await getClients(tenantId, {
      page: 1,
      limit: 10,
      search: testName
    });
    console.log(`List returned ${listResult.clients.length} results. Total count in DB matching: ${listResult.total}`);
    if (listResult.clients.length === 0) throw new Error("List returned 0 results for created client name");

    // 7. Test searchClients
    console.log("\nTesting searchClients...");
    const searchRes = await searchClients(tenantId, testName, 5);
    console.log(`Search returned ${searchRes.length} results.`);
    if (searchRes.length === 0) throw new Error("searchClients returned 0 results");

    // 8. Test getClientStats
    console.log("\nTesting getClientStats...");
    const stats = await getClientStats(tenantId);
    console.log("Stats overview:", stats.overview);

    // 9. Test getClientsForSelect
    console.log("\nTesting getClientsForSelect...");
    const selectOptions = await getClientsForSelect(tenantId);
    console.log(`Select options count: ${selectOptions.length}`);
    const foundOption = selectOptions.find(o => o.value === newClient.id);
    if (!foundOption) throw new Error("Created client option not found in select list");

    // 10. Test countActiveClients
    console.log("\nTesting countActiveClients...");
    const activeCount = await countActiveClients(tenantId);
    console.log(`Active clients count: ${activeCount}`);

    // 11. Test bulkUpdateClientStatus
    console.log("\nTesting bulkUpdateClientStatus (set inactive)...");
    const bulkUpdateCount = await bulkUpdateClientStatus([newClient.id], false, tenantId);
    console.log(`Bulk updated count: ${bulkUpdateCount}`);
    const checkInactive = await getClientById(newClient.id, tenantId);
    if (!checkInactive || checkInactive.isActive !== false) {
      throw new Error("Bulk update status to inactive failed");
    }

    // 12. Test deleteClient (soft delete)
    console.log("\nTesting deleteClient...");
    const deleteSuccess = await deleteClient(newClient.id, tenantId);
    console.log(`Delete operation success: ${deleteSuccess}`);

    // 13. Cleanup: Permanently delete test row from database
    console.log("\nCleaning up (permanent delete)...");
    await pool.query("DELETE FROM clients WHERE id = $1 AND tenant_id = $2", [newClient.id, tenantId]);
    console.log("Verification run completed successfully!");

  } catch (err) {
    console.error("Verification failed with error:", err);
  } finally {
    await pool.end();
  }
}

runVerification();
