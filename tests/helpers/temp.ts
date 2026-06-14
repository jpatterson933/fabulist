import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}
