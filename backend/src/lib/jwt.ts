import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "change_me_in_production";
const JWT_EXPIRES_IN = "7d";

export interface JwtPayload {
  sub: string;      // user id
  role: string;     // UserRole
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
