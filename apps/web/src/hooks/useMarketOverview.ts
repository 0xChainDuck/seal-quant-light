import { useQuery } from '@tanstack/react-query';
import type { ExchangeId, MarketType } from '@seal-quant/core';
import { fetchMarketOverview } from '../lib/api.js';

export function useMarketOverview(
  exchange: ExchangeId,
  marketType: MarketType,
  quoteAsset: string,
  limit = 200
) {
  return useQuery({
    queryKey: ['market-overview', exchange, marketType, quoteAsset, limit],
    queryFn: () => fetchMarketOverview(exchange, marketType, quoteAsset, limit),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1
  });
}
