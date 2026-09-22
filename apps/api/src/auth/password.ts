import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export function hashPassword(password:string){
  return crypto.scryptSync(password,process.env.PASSWORD_PEPPER||'',64).toString('hex');
}

export function verifyPassword(password:string,hash:string){
  try{
    if(/^\$2[aby]\$/.test(hash)) return bcrypt.compareSync(password,hash);
    return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(hashPassword(password),'hex'));
  }catch{return false;}
}