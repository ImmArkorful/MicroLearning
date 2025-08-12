const { Pool } = require("pg");
require("dotenv").config();

// Create a single, persistent connection pool for the entire application
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// Export a query function that uses the pool
module.exports = {
  query: (text, params) => pool.query(text, params),
};
