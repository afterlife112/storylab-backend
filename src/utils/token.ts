import crypto from 'node:crypto';

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (size = 32) => crypto.randomBytes(size).toString('base64url');
