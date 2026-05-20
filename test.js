// require('dotenv').config();
// const { Pool } = require('pg');
// const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// pool.query(`SELECT rp.id, rp.version, rp.type, rp.status, p.name FROM release_plans rp JOIN projects p ON p.id = rp.project_id`).then(res => {
//     console.log(res.rows);
//     pool.end();
// }).catch(e => {
//     console.error(e);
//     pool.end();
// });
