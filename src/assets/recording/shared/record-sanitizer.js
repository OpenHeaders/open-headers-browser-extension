/**
 * Sanitizes record data to prevent CSP violations during replay
 */
export function sanitizeRecordForReplay(record) {
  if (!record || !record.events) return record;
  
  // Clone the record to avoid modifying the original
  const sanitizedRecord = JSON.parse(JSON.stringify(record));
  
  sanitizedRecord.events = sanitizedRecord.events.map(event => {
    // For full snapshot events (type 2) and incremental snapshots (type 3)
    if (event.type === 2 || event.type === 3) {
      // Process the event data
      if (event.data) {
        const sanitizedData = sanitizeNodeData(event.data);
        return { ...event, data: sanitizedData };
      }
    }
    return event;
  });
  
  return sanitizedRecord;
}

function sanitizeNodeData(data) {
  if (!data) return data;
  
  // Process node data recursively
  if (data.node) {
    data.node = sanitizeNode(data.node);
  }
  
  if (data.adds) {
    data.adds = data.adds.map(add => ({
      ...add,
      node: sanitizeNode(add.node)
    }));
  }
  
  if (data.attributes) {
    data.attributes = data.attributes.map(attr => ({
      ...attr,
      attributes: sanitizeAttributes(attr.attributes)
    }));
  }
  
  return data;
}

function sanitizeNode(node) {
  if (!node) return node;
  
  // Sanitize attributes if present
  if (node.attributes) {
    node.attributes = sanitizeAttributes(node.attributes);
  }
  
  // Process child nodes recursively
  if (node.childNodes) {
    node.childNodes = node.childNodes.map(child => sanitizeNode(child));
  }
  
  return node;
}

function sanitizeAttributes(attributes) {
  if (!attributes) return attributes;
  
  const sanitized = { ...attributes };
  
  // Replace external image sources with placeholder
  if (sanitized.src && isExternalUrl(sanitized.src) && !isDataUrl(sanitized.src)) {
    sanitized['data-original-src'] = sanitized.src;
    sanitized.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRTBFMEUwIi8+CjxwYXRoIGQ9Ik0zNSAzNUgzN1Y0MUgzNVYzNVpNMzkgMzVINDFWNDFIMzlWMzVaTTQzIDM1SDQ1VjQxSDQzVjM1WiIgZmlsbD0iIzlFOUU5RSIvPgo8cGF0aCBkPSJNMzUgNDNIMzdWNDlIMzVWNDNaTTM5IDQzSDQxVjQ5SDM5VjQzWk00MyA0M0g0NVY0OUg0M1Y0M1oiIGZpbGw9IiM5RTlFOUUiLz4KPHBhdGggZD0iTTM1IDUxSDM3VjU3SDM1VjUxWk0zOSA1MUg0MVY1N0gzOVY1MVpNNDMgNTFINDVWNTdINDNWNTFaIiBmaWxsPSIjOUU5RTlFIi8+CjxwYXRoIGQ9Ik01NSA0MEM1NSA0Mi43NjE0IDUyLjc2MTQgNDUgNTAgNDVDNDcuMjM4NiA0NSA0NSA0Mi43NjE0IDQ1IDQwQzQ1IDM3LjIzODYgNDcuMjM4NiAzNSA1MCAzNUM1Mi43NjE0IDM1IDU1IDM3LjIzODYgNTUgNDBaIiBmaWxsPSIjOUU5RTlFIi8+CjxwYXRoIGQ9Ik0zNSA2MEM0NSA1MCA1NSA1MCA2NSA2MFYyNUgyNVY2MFoiIGZpbGw9IiM5RTlFOUUiLz4KPC9zdmc+'; // Placeholder image
  }
  
  // Handle background images in style
  if (sanitized.style && sanitized.style.includes('url(')) {
    sanitized.style = sanitized.style.replace(/url\(['"]?(https?:\/\/[^'")]+)['"]?\)/g, (match, url) => {
      return 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNFMEUwRTAiLz48L3N2Zz4=)';
    });
  }
  
  // Remove external font references
  if (sanitized.href && isExternalUrl(sanitized.href) && isFontUrl(sanitized.href)) {
    sanitized['data-original-href'] = sanitized.href;
    delete sanitized.href;
  }
  
  return sanitized;
}

function isExternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

function isDataUrl(url) {
  return url && url.startsWith('data:');
}

function isFontUrl(url) {
  const fontExtensions = ['.woff', '.woff2', '.ttf', '.otf', '.eot'];
  return fontExtensions.some(ext => url.includes(ext));
}