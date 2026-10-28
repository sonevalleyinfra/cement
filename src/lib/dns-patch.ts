import dns from "node:dns";
import net from "node:net";

if (net.setDefaultAutoSelectFamily) net.setDefaultAutoSelectFamily(false);

let patched = false;

/**
 * On Windows Node.js, `dns.lookup` (which uses OS `getaddrinfo`) can return ENOENT
 * for complex CNAME chains (e.g. Neon AWS hostnames).
 * This fallback intercepts any failed Neon lookup and resolves via `dns.resolve4`.
 */
export function ensureDnsPatch() {
  if (patched) return;
  patched = true;

  const origLookup = dns.lookup;

  // @ts-expect-error monkey patch dns.lookup for Windows compatibility
  dns.lookup = function (hostname: string, options: any, callback: any) {
    let cb = callback;
    let opt = options;
    if (typeof options === "function") {
      cb = options;
      opt = {};
    }

    origLookup(hostname, opt, (err: NodeJS.ErrnoException | null, address: string, family: number) => {
      if (err && typeof hostname === "string" && hostname.includes("neon.tech")) {
        dns.resolve4(hostname, (rErr, addresses) => {
          if (!rErr && addresses && addresses.length > 0) {
            if (opt && opt.all) {
              return cb(
                null,
                addresses.map((a) => ({ address: a, family: 4 })),
              );
            }
            return cb(null, addresses[0], 4);
          }
          return cb(err, address, family);
        });
      } else {
        cb(err, address, family);
      }
    });
  };
}

ensureDnsPatch();
