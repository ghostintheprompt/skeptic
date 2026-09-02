import fs from "fs/promises";
import path from "path";

const UPLOADS_DIR = "/var/app/uploads";

export async function readUploadedFile(filename: string): Promise<Buffer> {
  const fullPath = path.join(UPLOADS_DIR, filename);
  return fs.readFile(fullPath);
}
