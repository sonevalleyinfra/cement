import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Used by client components (sign-in/up forms). The server is on the same
// domain, so no baseURL is needed.
export const authClient = createAuthClient({
  plugins: [adminClient()],
});
