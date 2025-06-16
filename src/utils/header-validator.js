/**
 * Functions for validating and sanitizing header names, values, and domains
 * for use in browser extension APIs (Chrome, Firefox, Edge, Safari)
 */

// List of headers that cannot be modified by extensions
// Based on Chrome's declarativeNetRequest and Firefox WebRequest APIs
const FORBIDDEN_REQUEST_HEADERS = new Set([
  // Security headers
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'transfer-encoding',

  // Browser-controlled headers
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'date',
  'dnt',
  'expect',
  'origin',
  'permissions-policy',
  'tk',
  'upgrade-insecure-requests',

  // Proxy headers
  'proxy-authorization',
  'proxy-connection',

  // Special headers
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',

  // Internal browser headers
  'x-devtools-emulate-network-conditions-client-id',
  'x-devtools-request-id'
]);

const FORBIDDEN_RESPONSE_HEADERS = new Set([

  // Browser-controlled headers
  'alt-svc',
  'clear-site-data',
  'connection',
  'content-length',
  'content-encoding',
  'content-range',
  'date',
  'expect-ct',
  'keep-alive',
  'public-key-pins',
  'strict-transport-security',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'vary'
]);

// Headers that require special handling or may cause issues
const WARNING_HEADERS = new Set([
  'authorization',
  'cookie',
  'location',
  'www-authenticate',
  'proxy-authenticate',
  'content-type',
  'content-disposition',
  'cache-control',
  'expires',
  'pragma',
  'etag',
  'last-modified',
  'if-match',
  'if-none-match',
  'if-modified-since',
  'if-unmodified-since',

  // CORS headers (with some exceptions)
  'access-control-allow-credentials',
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
  'access-control-request-headers',
  'access-control-request-method',

  // Security-critical headers
  'set-cookie',
  'set-cookie2'
]);

/**
 * Validates a header name for browser extension compatibility
 * @param {string} name - The header name to validate
 * @param {boolean} isResponse - Whether this is a response header
 * @returns {object} - Validation result with valid flag, sanitized name, warning, and message
 */
export function validateHeaderName(name, isResponse = false) {
  if (!name) {
    return {
      valid: false,
      message: 'Header name cannot be empty'
    };
  }

  if (typeof name !== 'string') {
    return {
      valid: false,
      message: 'Header name must be a string'
    };
  }

  // Trim whitespace
  const trimmedName = name.trim();

  if (!trimmedName) {
    return {
      valid: false,
      message: 'Header name cannot be only whitespace'
    };
  }

  // Check length
  if (trimmedName.length > 256) {
    return {
      valid: false,
      message: 'Header name is too long (max 256 characters)'
    };
  }

  // Normalize to lowercase for validation
  const lowerName = trimmedName.toLowerCase();

  // Check if it's a forbidden header
  const forbiddenSet = isResponse ? FORBIDDEN_RESPONSE_HEADERS : FORBIDDEN_REQUEST_HEADERS;
  if (forbiddenSet.has(lowerName)) {
    return {
      valid: false,
      message: `"${trimmedName}" is a protected header that cannot be modified by extensions`
    };
  }

  // Validate header name format (RFC 7230)
  // Header field names must be valid tokens: visible ASCII characters except delimiters
  const validHeaderNameRegex = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;
  if (!validHeaderNameRegex.test(trimmedName)) {
    return {
      valid: false,
      message: 'Header name contains invalid characters. Only letters, numbers, and -_.~!#$%&\'*+^`| are allowed'
    };
  }

  // Check for headers that may cause issues
  let warning = null;
  
  // Only show warning for referer spelling
  if (lowerName === 'referrer') {
    warning = 'Note: The correct spelling is "Referer" (single r)';
  }

  return {
    valid: true,
    sanitized: trimmedName,
    warning,
    message: ''
  };
}

/**
 * Validates if a header value is acceptable for browser APIs
 * @param {string} value - The header value to validate
 * @param {string} headerName - The header name (for context-specific validation)
 * @returns {object} - Validation result with valid flag and message
 */
export function validateHeaderValue(value, headerName = '') {
  if (value === undefined || value === null || value === '') {
    return {
      valid: false,
      message: 'Header value cannot be empty'
    };
  }

  if (typeof value !== 'string') {
    return {
      valid: false,
      message: 'Header value must be a string'
    };
  }

  // Trim the value to check if it's only whitespace
  if (!value.trim()) {
    return {
      valid: false,
      message: 'Header value cannot be only whitespace'
    };
  }

  // Check length - most browsers limit header values
  if (value.length > 8192) {
    return {
      valid: false,
      message: 'Header value is too long (max 8192 characters)'
    };
  }

  // Check for null bytes which are never allowed
  if (value.includes('\0')) {
    return {
      valid: false,
      message: 'Header value cannot contain null bytes'
    };
  }

  // Check for line folding (CRLF followed by space/tab) - deprecated in HTTP/1.1
  if (/\r\n[\t ]/.test(value)) {
    return {
      valid: false,
      message: 'Header value cannot contain line folding (CRLF followed by space/tab)'
    };
  }

  // Check for newlines or carriage returns
  if (/[\r\n]/.test(value)) {
    return {
      valid: false,
      message: 'Header value cannot contain line breaks'
    };
  }

  // Check for control characters (0-31 and 127) except tab (9)
  const hasControlChars = /[\x00-\x08\x0A-\x1F\x7F]/.test(value);
  if (hasControlChars) {
    return {
      valid: false,
      message: 'Header value contains invalid control characters'
    };
  }

  // Validate specific header value formats
  const lowerHeaderName = headerName.toLowerCase();


  // Content-Type validation
  if (lowerHeaderName === 'content-type') {
    if (!/^[\w\-\/\+\.]+/.test(value)) {
      return {
        valid: false,
        message: 'Content-Type header has invalid format'
      };
    }
  }

  // Warning for non-ASCII characters (extended ASCII 128-255)
  const hasNonAscii = /[\x80-\xFF]/.test(value);
  if (hasNonAscii) {
    return {
      valid: true,
      warning: 'Header value contains non-ASCII characters that may cause compatibility issues',
      message: ''
    };
  }

  return {
    valid: true,
    message: ''
  };
}

/**
 * Validates a domain pattern for use in declarativeNetRequest
 * @param {string} domain - The domain pattern to validate
 * @returns {object} - Validation result with valid flag, sanitized domain, and message
 */
export function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return {
      valid: false,
      message: 'Domain pattern cannot be empty'
    };
  }

  const trimmed = domain.trim();
  if (!trimmed) {
    return {
      valid: false,
      message: 'Domain pattern cannot be only whitespace'
    };
  }

  // Check length
  if (trimmed.length > 2000) {
    return {
      valid: false,
      message: 'Domain pattern is too long (max 2000 characters)'
    };
  }

  // Check for spaces (not allowed in URL patterns)
  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      message: 'Domain pattern cannot contain spaces'
    };
  }

  // First, let's separate the URL into components for proper validation
  let protocol = '';
  let domainPart = trimmed;
  let pathAndQuery = '';

  // Extract protocol if present
  const protocolMatch = trimmed.match(/^([a-zA-Z*]+):\/\//);
  if (protocolMatch) {
    protocol = protocolMatch[1];
    domainPart = trimmed.substring(protocolMatch[0].length);
  }

  // Extract path and query if present
  const firstSlash = domainPart.indexOf('/');
  if (firstSlash !== -1) {
    pathAndQuery = domainPart.substring(firstSlash);
    domainPart = domainPart.substring(0, firstSlash);
  }

  // Validate the domain part according to RFC 1123 and RFC 3986
  // Domain names can only contain: letters, numbers, dots, hyphens, and wildcards
  // They can also include port numbers (colon followed by digits)
  // For IPv6, we allow square brackets
  if (domainPart) {
    // Check for IPv6
    if (domainPart.startsWith('[') && domainPart.includes(']')) {
      // Basic IPv6 validation - just check allowed characters within brackets
      const ipv6Part = domainPart.substring(0, domainPart.lastIndexOf(']') + 1);
      const afterIpv6 = domainPart.substring(domainPart.lastIndexOf(']') + 1);

      // IPv6 can contain hex digits, colons, and dots (for IPv4-mapped addresses)
      if (!/^\[[0-9a-fA-F:\.]+\]$/.test(ipv6Part)) {
        return {
          valid: false,
          message: 'Invalid IPv6 address format'
        };
      }

      // After IPv6, only port is allowed
      if (afterIpv6 && !/^:\d+$/.test(afterIpv6)) {
        return {
          valid: false,
          message: 'Invalid characters after IPv6 address'
        };
      }
    } else {
      // Regular domain validation
      // Split by port if present
      const portIndex = domainPart.lastIndexOf(':');
      let domain = domainPart;
      let port = '';

      if (portIndex !== -1) {
        // Check if it's a valid port
        const possiblePort = domainPart.substring(portIndex + 1);
        if (/^\d+$/.test(possiblePort)) {
          domain = domainPart.substring(0, portIndex);
          port = possiblePort;

          // Validate port number
          const portNum = parseInt(port);
          if (portNum < 0 || portNum > 65535) {
            return {
              valid: false,
              message: 'Port number must be between 0 and 65535'
            };
          }
        }
      }

      // Domain can only contain: a-z, A-Z, 0-9, dot, hyphen, and wildcard
      // According to RFC 1123, domain labels cannot start or end with hyphen
      const invalidDomainChars = /[^a-zA-Z0-9\-\.\*]/;
      if (invalidDomainChars.test(domain)) {
        return {
          valid: false,
          message: 'Domain contains invalid characters. Only letters, numbers, dots, hyphens, and wildcards (*) are allowed'
        };
      }

      // Check each label (part between dots)
      if (!domain.includes('*')) {
        const labels = domain.split('.');
        for (const label of labels) {
          if (!label) {
            return {
              valid: false,
              message: 'Domain cannot have empty labels (consecutive dots)'
            };
          }

          // Labels cannot start or end with hyphen (RFC 1123)
          if (label.startsWith('-') || label.endsWith('-')) {
            return {
              valid: false,
              message: 'Domain labels cannot start or end with a hyphen'
            };
          }

          // Labels cannot be all numeric (to distinguish from IP addresses)
          // unless it's part of an IP address
          if (/^\d+$/.test(label) && labels.length === 4) {
            // Might be an IP address, will be validated separately
            continue;
          }
        }
      }
    }
  }

  // Validate path and query string part
  if (pathAndQuery) {
    // Path and query can contain more characters, but still need some validation
    // According to RFC 3986, these are the unreserved and reserved characters allowed
    // unreserved: a-zA-Z0-9-._~
    // reserved (gen-delims): :/?#[]@
    // reserved (sub-delims): !$&'()*+,;=
    // We also allow % for percent-encoded characters
    const invalidPathChars = /[^a-zA-Z0-9\-\._~:\/\?#\[\]@!$&'()*+,;=%]/;
    if (invalidPathChars.test(pathAndQuery)) {
      // Check for common invalid characters and provide specific messages
      if (pathAndQuery.includes(' ')) {
        return {
          valid: false,
          message: 'URL path cannot contain spaces. Use %20 for spaces in URLs'
        };
      }
      if (pathAndQuery.includes('<') || pathAndQuery.includes('>')) {
        return {
          valid: false,
          message: 'URL path cannot contain < or > characters'
        };
      }
      if (pathAndQuery.includes('"')) {
        return {
          valid: false,
          message: 'URL path cannot contain quotation marks'
        };
      }
      if (pathAndQuery.includes('\\')) {
        return {
          valid: false,
          message: 'URL path cannot contain backslashes. Use forward slashes (/) for paths'
        };
      }

      return {
        valid: false,
        message: 'URL path contains invalid characters'
      };
    }
  }

  // Validate wildcard usage
  if (trimmed.includes('*')) {
    // Check for invalid wildcard positions
    if (trimmed.includes('**')) {
      return {
        valid: false,
        message: 'Domain pattern cannot contain consecutive wildcards (**)'
      };
    }

    // Wildcards should be used properly
    const parts = trimmed.split('*');
    for (let i = 1; i < parts.length - 1; i++) {
      if (parts[i] === '') {
        return {
          valid: false,
          message: 'Invalid wildcard usage in domain pattern'
        };
      }
    }

    // Check for mid-domain wildcards (e.g., ex*ample.com)
    if (trimmed.includes('*') && !trimmed.startsWith('*') && !trimmed.includes('://*') && !trimmed.includes('.*')) {
      const beforeWildcard = trimmed.substring(0, trimmed.indexOf('*'));
      if (!/[\/\.]$/.test(beforeWildcard) && !beforeWildcard.endsWith('://')) {
        return {
          valid: true,
          warning: 'Wildcards in the middle of domains may not work as expected',
          sanitized: trimmed
        };
      }
    }
  }

  // Validate specific patterns
  if (trimmed === '*') {
    return {
      valid: true,
      warning: 'This pattern will match ALL websites. Use with caution!',
      sanitized: trimmed
    };
  }

  // Additional validation for specific invalid patterns
  if (trimmed.includes(';')) {
    return {
      valid: false,
      message: 'Domain pattern cannot contain semicolons'
    };
  }

  if (trimmed.includes('{') || trimmed.includes('}')) {
    return {
      valid: false,
      message: 'Domain pattern cannot contain curly braces'
    };
  }

  if (trimmed.includes('|') && !trimmed.includes('||')) {
    return {
      valid: false,
      message: 'Domain pattern cannot contain pipe character'
    };
  }

  // Check for proper URL pattern format
  if (trimmed.includes('://')) {
    // Has protocol
    const protocolMatch = trimmed.match(/^(\*|https?|file|ftp|wss?):\/\//);
    if (!protocolMatch) {
      return {
        valid: false,
        message: 'Invalid protocol in URL pattern. Use http://, https://, file://, or *://'
      };
    }

    // Validate the rest after protocol
    const afterProtocol = trimmed.substring(protocolMatch[0].length);
    if (!afterProtocol || afterProtocol === '/') {
      return {
        valid: false,
        message: 'URL pattern must include a domain after the protocol'
      };
    }
  }

  // Check for common mistakes
  if (trimmed.startsWith('.')) {
    return {
      valid: false,
      message: 'Domain pattern cannot start with a dot. Use *.example.com for subdomains'
    };
  }

  if (trimmed.endsWith('*') && !trimmed.endsWith('/*')) {
    return {
      valid: true,
      warning: 'Patterns should typically end with /* to match all paths',
      sanitized: trimmed
    };
  }

  // Validate IP addresses if present
  const ipv4Regex = /(\d{1,3}\.){3}\d{1,3}/;
  if (ipv4Regex.test(trimmed)) {
    const matches = trimmed.match(ipv4Regex);
    if (matches) {
      const parts = matches[0].split('.');
      const isValidIp = parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
      if (!isValidIp) {
        return {
          valid: false,
          message: 'Invalid IPv4 address in domain pattern'
        };
      }
    }
  }

  // Check for localhost patterns
  if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
    return {
      valid: true,
      warning: 'This pattern will only match local development servers',
      sanitized: trimmed
    };
  }

  // Warn about file:// URLs
  if (trimmed.startsWith('file://')) {
    return {
      valid: true,
      warning: 'File URLs require additional extension permissions to work',
      sanitized: trimmed
    };
  }

  return {
    valid: true,
    sanitized: trimmed,
    message: ''
  };
}

/**
 * Validates an array of domain patterns
 * @param {Array<string>} domains - Array of domain patterns
 * @returns {object} - Validation result with valid flag and message
 */
export function validateDomains(domains) {
  if (!Array.isArray(domains)) {
    return {
      valid: false,
      message: 'Domains must be an array'
    };
  }

  if (domains.length === 0) {
    return {
      valid: false,
      message: 'At least one domain pattern is required'
    };
  }

  if (domains.length > 100) {
    return {
      valid: false,
      message: 'Too many domain patterns (max 100)'
    };
  }

  // Check for duplicates
  const uniqueDomains = new Set(domains.map(d => d.trim().toLowerCase()));
  if (uniqueDomains.size !== domains.length) {
    return {
      valid: false,
      message: 'Duplicate domain patterns detected'
    };
  }

  // Validate each domain
  const errors = [];
  const warnings = [];

  for (const domain of domains) {
    const validation = validateDomain(domain);
    if (!validation.valid) {
      errors.push(`"${domain}": ${validation.message}`);
    } else if (validation.warning) {
      warnings.push(`"${domain}": ${validation.warning}`);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      message: errors.join('; ')
    };
  }

  if (warnings.length > 0) {
    return {
      valid: true,
      warning: warnings.join('; '),
      message: ''
    };
  }

  return {
    valid: true,
    message: ''
  };
}

/**
 * Sanitizes a header value by removing or replacing invalid characters
 * @param {string} value - The header value to sanitize
 * @returns {string} - The sanitized header value
 */
export function sanitizeHeaderValue(value) {
  if (!value) return '';

  // Convert to string
  let sanitized = String(value);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove control characters except tab
  sanitized = sanitized.replace(/[\x00-\x08\x0A-\x1F\x7F]/g, '');

  // Replace newlines and carriage returns with spaces
  sanitized = sanitized.replace(/[\r\n]+/g, ' ');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Truncate if too long
  if (sanitized.length > 8192) {
    sanitized = sanitized.substring(0, 8189) + '...';
  }

  return sanitized;
}

/**
 * Get a list of suggested header names based on input
 * @param {string} input - The partial header name
 * @param {boolean} isResponse - Whether this is for response headers
 * @returns {Array<string>} - Array of suggested header names
 */
export function getSuggestedHeaders(input, isResponse = false) {
  const commonRequestHeaders = [
    // Standard Request Headers
    'Accept',
    'Accept-Charset',
    'Accept-Encoding',
    'Accept-Language',
    'Accept-Datetime',
    'Authorization',
    'Cache-Control',
    'Connection',
    'Content-Type',
    'Content-Length',
    'Content-MD5',
    'Cookie',
    'Date',
    'Expect',
    'Forwarded',
    'From',
    'Host',
    'If-Match',
    'If-Modified-Since',
    'If-None-Match',
    'If-Range',
    'If-Unmodified-Since',
    'Max-Forwards',
    'Origin',
    'Pragma',
    'Proxy-Authorization',
    'Range',
    'Referer',
    'TE',
    'User-Agent',
    'Upgrade',
    'Via',
    'Warning',

    // Common Non-Standard Request Headers
    'X-Requested-With',
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Proto',
    'X-Http-Method-Override',
    'X-ATT-DeviceId',
    'X-Wap-Profile',
    'X-UIDH',
    'X-Csrf-Token',
    'X-XSRF-TOKEN',
    'X-Request-ID',
    'X-Correlation-ID',
    'X-Real-IP',
    'X-Forwarded-Server',
    'X-Forwarded-Port',
    'X-Original-URL',
    'X-Original-Host',
    'X-Scheme',
    'X-Device-User-Agent',
    'X-Client-IP',
    'X-Client-Host',
    'X-Host',

    // API Headers
    'X-API-Key',
    'X-API-Version',
    'X-API-Token',
    'X-Auth-Token',
    'X-Access-Token',
    'X-App-Version',
    'X-App-Name',
    'X-SDK-Version',

    // Custom Headers
    'X-Custom-Header',
    'X-Debug',
    'X-Debug-Mode',
    'X-Test',
    'X-Test-Header',

    // Security Headers (Request)
    'X-Content-Security-Policy',
    'X-WebKit-CSP',

    // CORS Request Headers
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',

    // WebSocket Headers
    'Sec-WebSocket-Key',
    'Sec-WebSocket-Extensions',
    'Sec-WebSocket-Accept',
    'Sec-WebSocket-Protocol',
    'Sec-WebSocket-Version',

    // Other Protocol Headers
    'Upgrade-Insecure-Requests',
    'DNT',
    'X-DNT',
    'Save-Data',
    'Viewport-Width',
    'Width',
    'DPR',
    'Device-Memory',
    'RTT',
    'Downlink',
    'ECT',

    // Authentication Headers
    'WWW-Authenticate',
    'Proxy-Authenticate',
    'X-Auth-User',
    'X-User-ID',
    'X-User-Email',
    'X-User-Name',
    'X-Session-ID',

    // Tracing Headers
    'X-B3-TraceId',
    'X-B3-SpanId',
    'X-B3-ParentSpanId',
    'X-B3-Sampled',
    'X-B3-Flags',
    'X-Trace-ID',
    'X-Span-ID',
    'Traceparent',
    'Tracestate',

    // CloudFlare Headers
    'CF-IPCountry',
    'CF-Device-Type',
    'CF-RAY',
    'CF-Visitor',
    'CF-Request-ID',
    'CF-Connecting-IP',

    // AWS Headers
    'X-Amz-Date',
    'X-Amz-Security-Token',
    'X-Amz-Content-SHA256',
    'X-Amz-User-Agent',
    'X-Amzn-Trace-Id',

    // Other Cloud Provider Headers
    'X-Azure-ClientIP',
    'X-Azure-SocketIP',
    'X-Azure-Ref',
    'X-Azure-RequestChain',
    'X-Google-Apps-Metadata',

    // Mobile App Headers
    'X-Device-Type',
    'X-Device-Model',
    'X-Device-OS',
    'X-Device-OS-Version',
    'X-App-Platform',
    'X-App-Build',

    // GraphQL Headers
    'X-GraphQL-Query-ID',
    'X-GraphQL-Operation-Name',

    // Performance Headers
    'X-Request-Start',
    'X-Queue-Start',
    'X-Request-Received',

    // Geolocation Headers
    'X-Forwarded-Latitude',
    'X-Forwarded-Longitude',
    'X-Country-Code',
    'X-Region',
    'X-City',
    'X-Timezone'
  ];

  const commonResponseHeaders = [
    // Standard Response Headers
    'Accept-Ranges',
    'Age',
    'Allow',
    'Cache-Control',
    'Connection',
    'Content-Encoding',
    'Content-Language',
    'Content-Length',
    'Content-Location',
    'Content-MD5',
    'Content-Disposition',
    'Content-Range',
    'Content-Type',
    'Date',
    'ETag',
    'Expires',
    'Last-Modified',
    'Link',
    'Location',
    'P3P',
    'Pragma',
    'Proxy-Authenticate',
    'Public-Key-Pins',
    'Retry-After',
    'Server',
    'Set-Cookie',
    'Status',
    'Strict-Transport-Security',
    'Trailer',
    'Transfer-Encoding',
    'Vary',
    'Via',
    'Warning',
    'WWW-Authenticate',

    // CORS Response Headers
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials',
    'Access-Control-Expose-Headers',
    'Access-Control-Max-Age',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Headers',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',

    // Security Response Headers
    'Content-Security-Policy',
    'Content-Security-Policy-Report-Only',
    'Cross-Origin-Embedder-Policy',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
    'Expect-CT',
    'Feature-Policy',
    'Permissions-Policy',
    'Public-Key-Pins-Report-Only',
    'Referrer-Policy',
    'Report-To',
    'X-Content-Type-Options',
    'X-DNS-Prefetch-Control',
    'X-Download-Options',
    'X-Frame-Options',
    'X-Permitted-Cross-Domain-Policies',
    'X-Powered-By',
    'X-XSS-Protection',

    // Common Non-Standard Response Headers
    'X-Request-ID',
    'X-Correlation-ID',
    'X-Response-ID',
    'X-Trace-ID',
    'X-Transaction-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-RateLimit-Used',
    'X-Rate-Limit-Limit',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',

    // API Response Headers
    'X-API-Version',
    'X-API-Deprecation-Date',
    'X-API-Deprecation-Info',
    'X-API-Warn',
    'X-Response-Time',
    'X-Response-Duration',
    'X-Response-Milliseconds',

    // Caching Headers
    'X-Cache',
    'X-Cache-Status',
    'X-Cache-Hit',
    'X-Cache-Hits',
    'X-Cache-Key',
    'X-Cache-TTL',
    'X-Proxy-Cache',
    'X-Varnish',
    'X-Varnish-Cache',
    'X-Fastly-Request-ID',
    'X-Served-By',
    'X-Timer',

    // CDN Headers
    'X-CDN',
    'X-CDN-Pop',
    'X-CDN-Pop-IP',
    'X-Edge-Location',
    'X-Edge-Request-ID',
    'X-Edge-Response-Time',
    'X-Edge-IP',
    'X-Edge-Connect-Time',

    // CloudFlare Response Headers
    'CF-Cache-Status',
    'CF-RAY',
    'CF-Request-ID',
    'CF-Edge-Server',

    // AWS Response Headers
    'X-Amz-Request-ID',
    'X-Amz-ID-2',
    'X-Amz-CloudFront-ID',
    'X-Amz-Cf-Pop',
    'X-Amz-Cf-Id',
    'X-Amz-Version-ID',
    'X-Amz-Delete-Marker',

    // Error Headers
    'X-Error',
    'X-Error-Code',
    'X-Error-Message',
    'X-Error-Detail',
    'X-Error-Info',

    // Debug Headers
    'X-Debug',
    'X-Debug-Info',
    'X-Debug-Token',
    'X-Debug-Token-Link',
    'X-Robots-Tag',

    // Performance Headers
    'X-Runtime',
    'X-Server-Time',
    'X-Processing-Time',
    'X-Total-Time',
    'X-Backend-Server',

    // Custom Headers
    'X-Custom-Header',
    'X-Powered-By-Plesk',
    'X-AspNet-Version',
    'X-AspNetMvc-Version',
    'X-PHP-Version',

    // Pagination Headers
    'X-Page',
    'X-Page-Total',
    'X-Page-Size',
    'X-Total-Count',
    'X-Total-Pages',
    'X-Per-Page',
    'X-Next-Page',
    'X-Prev-Page',
    'X-First-Page',
    'X-Last-Page',

    // WebSocket Response Headers
    'Sec-WebSocket-Accept',
    'Sec-WebSocket-Protocol',
    'Sec-WebSocket-Extensions',
    'Sec-WebSocket-Version',

    // Push Headers
    'X-Associated-Content',
    'Link',
    'Push-Policy',

    // Experimental Headers
    'X-Content-Duration',
    'X-Content-Security-Policy',
    'X-Content-Security-Policy-Report-Only',
    'X-WebKit-CSP',
    'X-WebKit-CSP-Report-Only',

    // Timing Headers
    'Timing-Allow-Origin',
    'X-Firefox-Spdy',

    // Other Metadata
    'X-UA-Compatible',
    'X-Git-Commit',
    'X-Git-Branch',
    'X-Build-Version',
    'X-Build-Time',
    'X-Release-Version',
    'X-Environment',
    'X-Hostname',
    'X-Instance-ID',
    'X-Server-ID',
    'X-Node',
    'X-Pod',

    // GraphQL Response Headers
    'X-GraphQL-Event-Stream',
    'X-GraphQL-Subscription',

    // Compression Headers
    'X-Compress',
    'X-Compressed-By',
    'X-Original-Length',

    // Regional Headers
    'X-Region',
    'X-Datacenter',
    'X-Country',
    'X-City'
  ];

  const headers = isResponse ? commonResponseHeaders : commonRequestHeaders;
  const lowerInput = input.toLowerCase();

  return headers.filter(header =>
      header.toLowerCase().includes(lowerInput) &&
      !FORBIDDEN_REQUEST_HEADERS.has(header.toLowerCase()) &&
      !FORBIDDEN_RESPONSE_HEADERS.has(header.toLowerCase())
  );
}