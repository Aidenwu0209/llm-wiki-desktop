export function isLoopbackHttpEndpoint(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw.toLowerCase().startsWith("http://")) {
    return false;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" || url.username || url.password) {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}
