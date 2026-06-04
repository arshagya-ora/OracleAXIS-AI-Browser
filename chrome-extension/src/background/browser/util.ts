/**
 * Checks if a URL is allowed based on firewall configuration
 * @param url The URL to check
 * @param allowList The allow list
 * @param denyList The deny list
 * @returns True if the URL is allowed, false otherwise
 */
export function isUrlAllowed(url: string, allowList: string[], denyList: string[]): boolean {
  // Normalize and validate input
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return false;
  }

  const lowerCaseUrl = trimmedUrl.toLowerCase();

  // ALWAYS block dangerous/forbidden URLs, even if firewall is disabled
  const DANGEROUS_PREFIXES = [
    'https://chromewebstore.google.com', // scripts are not allowed to be injected into chrome web store
    'chrome-extension://',
    'chrome://',
    'javascript:',
    'data:',
    'file:',
    'vbscript:',
    'ws:',
    'wss:',
  ];

  if (DANGEROUS_PREFIXES.some(prefix => lowerCaseUrl.startsWith(prefix))) {
    return false;
  }

  // Special case: Allow 'about:blank' explicitly
  if (trimmedUrl === 'about:blank') {
    return true;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    const urlWithoutProtocol = lowerCaseUrl.replace(/^https?:\/\//, '');
    const host = parsedUrl.host.toLowerCase();
    const hostname = parsedUrl.hostname.toLowerCase();

    if (allowList.length > 0) {
      return matchesUrlList(urlWithoutProtocol, host, hostname, allowList);
    }

    return !matchesUrlList(urlWithoutProtocol, host, hostname, denyList);
  } catch (error) {
    // Invalid URL format - deny by default
    return false;
  }
}

function matchesUrlList(urlWithoutProtocol: string, host: string, hostname: string, entries: string[]): boolean {
  for (const entry of entries) {
    const normalizedEntry = entry.trim().toLowerCase().replace(/^https?:\/\//, '');
    const normalizedEntryWithoutTrailingSlash = trimTrailingSlash(normalizedEntry);
    if (!normalizedEntryWithoutTrailingSlash) {
      continue;
    }

    if (trimTrailingSlash(urlWithoutProtocol) === normalizedEntryWithoutTrailingSlash) {
      return true;
    }

    // Entries with paths are URL-specific. Host/domain matching only applies
    // to bare host entries such as example.com or 127.0.0.1:3000.
    // Treat a trailing slash-only entry (e.g. example.com/) as a bare host.
    if (normalizedEntryWithoutTrailingSlash.includes('/')) {
      continue;
    }

    if (
      hostname === normalizedEntryWithoutTrailingSlash ||
      host === normalizedEntryWithoutTrailingSlash ||
      hostname.endsWith(`.${normalizedEntryWithoutTrailingSlash}`) ||
      host.endsWith(`.${normalizedEntryWithoutTrailingSlash}`)
    ) {
      return true;
    }
  }

  return false;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

// Check if a URL is a new tab page (about:blank or chrome://new-tab-page).
export function isNewTabPage(url: string): boolean {
  return url === 'about:blank' || url === 'chrome://new-tab-page' || url === 'chrome://new-tab-page/';
}

export function capTextLength(text: string, maxLength: number): string {
  if (text.length > maxLength) {
    return text.slice(0, maxLength) + '...';
  }
  return text;
}
