const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect()
  .then(() => console.log('PostgreSQL connected (local)'))
  .catch(err => console.error('DB connection error:', err.message));

module.exports = pool;
