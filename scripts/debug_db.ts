import pool from './src/config/dbpool';

async function check() {
  try {
    const { rows: columns } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    console.log('USERS COLUMNS:', columns.map(r => r.column_name));

    // Try both naming conventions
    const { rows: users } = await pool.query('SELECT * FROM users LIMIT 1');
    console.log('USER DATA:', users[0]);
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
