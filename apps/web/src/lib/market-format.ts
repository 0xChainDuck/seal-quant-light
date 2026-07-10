export function formatCompactNumber(value: number | null, prefix = ''): string {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  return `${prefix}${new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2
  }).format(value)}`;
}

export function formatCurrency(value: number | null): string {
  return formatCompactNumber(value, '$');
}

export function formatPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function formatMarketPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits
  }).format(value);
}

export function valueTone(value: number | null): 'positive' | 'negative' | 'neutral' {
  if (value === null || value === 0) {
    return 'neutral';
  }

  return value > 0 ? 'positive' : 'negative';
}
