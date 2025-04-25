const { Pool } = require('pg');

// Create a new Pool instance with connection details
const pool = new Pool({
  user: 'postgres',      // Default PostgreSQL user, change if needed
  host: 'localhost',     // Database host
  database: 'food_app',  // Database name
  password: '1234',  // Default password, change to your actual password
  port: 5432,            // Default PostgreSQL port
});

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
  }
});

// Export the pool to be used in other files
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};