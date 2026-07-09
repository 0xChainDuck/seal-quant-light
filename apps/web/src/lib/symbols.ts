export function symbolBaseAsset(symbol: string): string {
  return symbol.split('/')[0]?.toUpperCase() ?? '';
}

export function symbolQuoteAsset(symbol: string): string {
  const [, quoteAndSettle = ''] = symbol.split('/');
  const [quotePart = '', settlePart = ''] = quoteAndSettle.split(':');
  const rawAsset = settlePart || quotePart;
  return rawAsset.split('-')[0]?.toUpperCase() ?? '';
}

export function symbolContractSuffix(symbol: string): string {
  const [, quoteAndSettle = ''] = symbol.split('/');
  const [, settlePart = ''] = quoteAndSettle.split(':');
  const [, suffix = ''] = settlePart.split('-');
  return suffix.toUpperCase();
}

export function cleanSymbolBase(symbol: string): string {
  const base = symbolBaseAsset(symbol);
  const suffix = symbolContractSuffix(symbol);
  return suffix ? `${base} ${suffix}` : base;
}

export function displayMarketSymbol(symbol: string, quoteAsset?: string): string {
  const base = cleanSymbolBase(symbol);
  const quote = quoteAsset || symbolQuoteAsset(symbol);
  return base && quote ? `${base}/${quote}` : base || symbol;
}

export function normalizeSymbolInput(value: string): string {
  return value.trim().toUpperCase().split('/')[0]?.split(':')[0]?.trim() ?? '';
}
