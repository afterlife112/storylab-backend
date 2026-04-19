import bcrypt from 'bcryptjs';

export const hashValue = (value: string) => bcrypt.hash(value, 10);
export const verifyHash = (value: string, hash: string) => bcrypt.compare(value, hash);