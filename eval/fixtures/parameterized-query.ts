import { Pool } from "pg";

const pool = new Pool();

export async function findUserByEmail(email: string) {
  const result = await pool.query(
    "SELECT id, name, role FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
}
