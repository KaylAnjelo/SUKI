// /config/db.js
const pg = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: './.env' });

let db;

if (process.env.DATABASE_URL) {
  db = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log("Connecting to Railway PostgreSQL using connection string");
} else {
  db = new pg.Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: String(process.env.PGPASSWORD),
    port: Number(process.env.PGPORT),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log("LOCAL");
}

module.exports = db;
