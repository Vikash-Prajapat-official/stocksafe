export const backupDir: () => string;
export function encrypt(plain: Buffer, passphrase: string): Buffer;
export function decrypt(data: Buffer, passphrase: string): Buffer;
export function backupSqlite(opts?: { file?: string; dir?: string; passphrase?: string; keepDays?: number }): Promise<{ file: string; bytes: number }>;
export function restoreSqlite(opts: { backupFile: string; file?: string; passphrase?: string }): { file: string; kept: string | null; name: string };
