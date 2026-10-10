import dns from 'node:dns';

// Some networks resolve openrouter.ai / registry.npmjs.org to an IPv6 address only while
// IPv6 itself is unreachable, so every outbound request times out ("fetch failed").
// Forcing IPv4 lookups fixes that; OpenRouter and Supabase both serve IPv4.
// Disable with FORCE_IPV4=false (e.g. on an IPv6-only host).
let enabled = false;

export function enableForceIpv4() {
  if (enabled) return;
  enabled = true;
  const original = dns.lookup;
  dns.lookup = function lookupIpv4(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (typeof options === 'number') {
      options = { family: options };
    }
    return original.call(this, hostname, { ...(options ?? {}), family: 4 }, callback);
  };
}
