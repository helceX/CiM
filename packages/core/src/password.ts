import {
  randomBytes,
  timingSafeEqual,
  scrypt as scryptCallback,
  type ScryptOptions,
} from "node:crypto";

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * scrypt (via Node's built-in, audited `node:crypto` implementation) —
 * OWASP-acceptable alongside Argon2id/bcrypt for password storage, and
 * dependency-free (no native-addon build step in CI/deploy images).
 * Params follow OWASP's scrypt guidance (N=2^17 costs ~100ms on modern
 * hardware for a single hash — deliberately slow).
 */
const N = 2 ** 17;
const r = 8;
const p = 1;
const keyLength = 64;
// scrypt's peak memory use is ~128*N*r bytes; Node's default 32MB `maxmem`
// is too small for OWASP-recommended N=2^17, so it must be raised explicitly.
const maxmem = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password.normalize("NFKC"), salt, keyLength, {
    N,
    r,
    p,
    maxmem,
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, keyHex] = parts;
  const params = {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  };
  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    return false;
  }
  const salt = Buffer.from(saltHex ?? "", "hex");
  const expected = Buffer.from(keyHex ?? "", "hex");
  if (salt.length === 0 || expected.length === 0) return false;

  let derivedKey: Buffer;
  try {
    derivedKey = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem,
    });
  } catch {
    // N/r/p parsed as finite numbers but aren't valid scrypt params (e.g.
    // N not a power of two, r*p too large) — node:crypto throws
    // synchronously rather than yielding a comparable key. A corrupted
    // stored hash must fail closed here, not 500 the caller.
    return false;
  }

  return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
}
