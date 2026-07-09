export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const text = value.toString().toLowerCase();
  if (text.includes('e-')) {
    const [, exponent] = text.split('e-');
    return Number.parseInt(exponent ?? '0', 10);
  }

  return text.split('.')[1]?.length ?? 0;
}

export function inferPricePrecision(values: number[]): number {
  const prices = values.filter((value) => Number.isFinite(value) && value > 0);
  if (prices.length === 0) {
    return 2;
  }

  const minAbs = Math.min(...prices.map((value) => Math.abs(value)));
  const magnitudePrecision =
    minAbs >= 1000 ? 2 : minAbs >= 1 ? 4 : minAbs >= 0.01 ? 6 : minAbs >= 0.0001 ? 8 : 10;
  const observedPrecision = Math.max(...prices.slice(-300).map(decimalPlaces));

  return Math.min(Math.max(magnitudePrecision, observedPrecision), 10);
}

export function toPriceFormat(precision: number) {
  return {
    type: 'price' as const,
    precision,
    minMove: 1 / 10 ** precision
  };
}

export function formatPrice(value: number, precision: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  }).format(value);
}
