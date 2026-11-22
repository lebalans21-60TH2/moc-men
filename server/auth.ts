import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../src/types.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SANDBOX_WEBHOOK_SECRET = process.env.SANDBOX_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');

export interface AuthTokenPayload {
  userId: number;
  email: string;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signAuthToken(userId: number, email: string): string {
  const payload: AuthTokenPayload = {
    userId,
    email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function signSandboxPayload(transactionCode: string, status: string, amount: number): string {
  return crypto
    .createHmac('sha256', SANDBOX_WEBHOOK_SECRET)
    .update(`${transactionCode}:${status}:${amount}`)
    .digest('hex');
}

export function verifySandboxSignature(
  transactionCode: string,
  status: string,
  amount: number,
  signature: string
): boolean {
  const expected = signSandboxPayload(transactionCode, status, amount);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature || '', 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  fullName: string;
  phone: string;
  roles: UserRole[];
  isLocked: boolean;
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: AuthenticatedUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'Vui lòng đăng nhập để thực hiện thao tác này.' });
    return;
  }
  if (req.currentUser.isLocked) {
    res.status(403).json({ error: 'Tài khoản của bạn đang bị khóa. Vui lòng liên hệ quản trị viên.' });
    return;
  }
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      res.status(401).json({ error: 'Vui lòng đăng nhập.' });
      return;
    }
    if (req.currentUser.isLocked) {
      res.status(403).json({ error: 'Tài khoản đang bị khóa.' });
      return;
    }
    const hasRole = allowedRoles.some((r) => req.currentUser!.roles.includes(r));
    if (!hasRole) {
      res.status(403).json({ error: 'Bạn không có quyền truy cập chức năng này.' });
      return;
    }
    next();
  };
}
