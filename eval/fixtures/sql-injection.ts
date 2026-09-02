import { Pool } from "pg";

const pool = new Pool();

export async function findUserByEmail(email: string) {
  const query = `SELECT id, name, role FROM users WHERE email = '${email}'`;
  const result = await pool.query(query);
  return result.rows[0];
}
