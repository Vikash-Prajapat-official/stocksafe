import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummy: string | undefined;
/** A valid hash to compare against when the user does not exist, so timing does not reveal it. */
export function dummyHash(): string {
  return (dummy ??= bcrypt.hashSync("not-a-real-password", BCRYPT_COST));
}
