const CTA_VARIANTS = Object.freeze({
  primary: { bg: '#0d6efd', text: '#ffffff', border: '#0d6efd' },
  success: { bg: '#198754', text: '#ffffff', border: '#198754' },
  warning: { bg: '#ffc107', text: '#212529', border: '#ffc107' },
  danger: { bg: '#dc3545', text: '#ffffff', border: '#dc3545' },
  info: { bg: '#0dcaf0', text: '#212529', border: '#0dcaf0' },
  dark: { bg: '#212529', text: '#ffffff', border: '#212529' },
  light: { bg: '#f8f9fa', text: '#212529', border: '#d3d4d5' },
});

export function normalizeCtaVariant(value, fallback = 'dark') {
  const normalized = String(value || '').trim().toLowerCase();
  if (CTA_VARIANTS[normalized]) return normalized;
  return CTA_VARIANTS[fallback] ? fallback : 'dark';
}

export function ctaVariantStyle(value) {
  return CTA_VARIANTS[normalizeCtaVariant(value)];
}

export function supportedCtaVariants() {
  return Object.keys(CTA_VARIANTS);
}
