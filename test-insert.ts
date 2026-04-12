import pool from './src/config/dbPool';

async function testInsert() {
  try {
    // Get a valid tenant ID first
    const tenantRes = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (tenantRes.rows.length === 0) {
      console.log('No tenants found to test with.');
      return;
    }
    const tenantId = tenantRes.rows[0].id;

    const query = `
      INSERT INTO leads (
        tenant_id, client_name, client_mail, client_phone, client_location,
        title, summary, skills, duration, hour_based_amount,
        job_link, est_project_duration, status, actions_item,
        timeline_start, timeline_end, posted_on, documents
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *;
    `;

    const values = [
      tenantId,
      'Test Client',
      'test@example.com',
      '1234567890',
      'Test Location',
      'Test Job',
      'Summary',
      JSON.stringify(['React']),
      '3 months',
      50,
      'http://test.com',
      'Short Term',
      'Open',
      'Action',
      new Date(),
      new Date(),
      new Date(),
      JSON.stringify([])
    ];

    const res = await pool.query(query, values);
    console.log('Insert successful:', res.rows[0]);
  } catch (err: any) {
    console.error('Insert FAILED:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
  } finally {
    await pool.end();
  }
}

testInsert();
