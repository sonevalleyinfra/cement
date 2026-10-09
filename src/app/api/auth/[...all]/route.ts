import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// All Better Auth endpoints (sign-in, sign-up, verify email, reset password, ...).
export const { GET, POST } = toNextJsHandler(auth);
