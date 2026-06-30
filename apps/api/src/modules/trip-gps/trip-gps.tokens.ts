import {
  constantTimeEqual,
  randomBase64Url,
  sha256Digest,
  sha256Hex,
} from "../../lib/crypto";

const TOKEN_BYTES = 32;
const SHA256_BYTES = 32;
const SHA256_HEX_LENGTH = SHA256_BYTES * 2;
const ZERO_DIGEST = Buffer.alloc(SHA256_BYTES);

export type TokenPair = {
  ownerToken: string;
  viewerToken: string;
};

export function generateToken(): string {
  return randomBase64Url(TOKEN_BYTES);
}

export function generateTokenPair(): TokenPair {
  return {
    ownerToken: generateToken(),
    viewerToken: generateToken(),
  };
}

export function hashToken(token: string): string {
  const normalized = normalizeToken(token);

  if (!normalized) {
    throw new Error("Token is required.");
  }

  return sha256Hex(normalized);
}

export function verifyToken(token: string, expectedHash: string): boolean {
  const normalized = normalizeToken(token);
  const expectedDigest = sha256HexToBuffer(expectedHash);
  const actualDigest = normalized ? sha256Digest(normalized) : ZERO_DIGEST;
  const safeExpectedDigest = expectedDigest ?? ZERO_DIGEST;
  const matches = constantTimeEqual(actualDigest, safeExpectedDigest);

  return Boolean(normalized && expectedDigest && matches);
}

function normalizeToken(token: string): string {
  return token.trim();
}

function sha256HexToBuffer(value: string): Buffer | null {
  const normalized = value.trim().toLowerCase();

  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== SHA256_HEX_LENGTH) {
    return null;
  }

  return Buffer.from(normalized, "hex");
}
