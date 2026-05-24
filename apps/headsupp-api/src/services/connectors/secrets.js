function byteToHex(byte) {
  return byte.toString(16).padStart(2, '0');
}

export function generateConnectorSecret(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return `hu_sec_${Array.from(bytes, byteToHex).join('')}`;
}

export function publicConnector(connector, { includeSecret = false } = {}) {
  return {
    ...connector,
    connector_secret: includeSecret ? connector.connector_secret : undefined,
  };
}
