import type { MarketSummary } from '@seal-quant/core';
import { ArrowDown, ArrowUp, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  formatCurrency,
  formatMarketPrice,
  formatPercent,
  valueTone
} from '../lib/market-format.js';
import { displayMarketSymbol } from '../lib/symbols.js';
import { TokenAvatar } from './TokenAvatar.js';

type SortKey = 'volume24h' | 'marketCap' | 'change24h' | 'openInterest' | 'fundingRate';

type MarketTableProps = {
  markets: MarketSummary[];
  loading?: boolean;
  onSelect: (market: MarketSummary) => void;
};

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'change24h', label: '24h' },
  { key: 'volume24h', label: 'Volume 24h', className: 'column-wide' },
  { key: 'marketCap', label: 'Market cap', className: 'column-wide' },
  { key: 'openInterest', label: 'Open interest', className: 'column-derivative' },
  { key: 'fundingRate', label: 'Funding', className: 'column-derivative' }
];

function numericValue(market: MarketSummary, key: SortKey): number {
  return market[key] ?? Number.NEGATIVE_INFINITY;
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' }) {
  return direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}

export function MarketTable({ markets, loading = false, onSelect }: MarketTableProps) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'volume24h',
    direction: 'desc'
  });
  const sortedMarkets = useMemo(() => {
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...markets].sort((a, b) => (numericValue(a, sort.key) - numericValue(b, sort.key)) * direction);
  }, [markets, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const toggleFavorite = (symbol: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  return (
    <div className="market-table-wrap">
      <table className="market-table">
        <thead>
          <tr>
            <th className="favorite-column" aria-label="Favorite" />
            <th className="rank-column">#</th>
            <th>Market</th>
            <th className="number-cell">Price</th>
            {COLUMNS.map((column) => (
              <th className={`number-cell ${column.className ?? ''}`} key={column.key}>
                <button className="table-sort" type="button" onClick={() => toggleSort(column.key)}>
                  {column.label}
                  {sort.key === column.key ? <SortIcon direction={sort.direction} /> : null}
                </button>
              </th>
            ))}
            <th className="number-cell column-wide">OI 24h</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 12 }, (_, index) => (
                <tr className="market-row is-skeleton" key={index}>
                  <td colSpan={9}><span /></td>
                </tr>
              ))
            : sortedMarkets.map((market, index) => {
                const changeTone = valueTone(market.change24h);
                const oiTone = valueTone(market.openInterestChange24h);
                const isFavorite = favorites.has(market.symbol);
                return (
                  <tr className="market-row" key={market.symbol}>
                    <td className="favorite-column">
                      <button
                        className={isFavorite ? 'favorite-button is-active' : 'favorite-button'}
                        type="button"
                        title={isFavorite ? 'Remove favorite' : 'Add favorite'}
                        onClick={() => toggleFavorite(market.symbol)}
                      >
                        <Star fill={isFavorite ? 'currentColor' : 'none'} size={14} />
                      </button>
                    </td>
                    <td className="rank-column">{index + 1}</td>
                    <td>
                      <button className="market-identity" type="button" onClick={() => onSelect(market)}>
                        <TokenAvatar symbol={market.baseAsset} />
                        <span>
                          <strong>{market.baseAsset}</strong>
                          <small>{displayMarketSymbol(market.symbol, market.quoteAsset)}</small>
                        </span>
                        <span className="market-badge">{market.marketType === 'spot' ? 'Spot' : 'Perp'}</span>
                      </button>
                    </td>
                    <td className="number-cell market-price">{formatMarketPrice(market.price)}</td>
                    <td className={`number-cell value-${changeTone}`}>{formatPercent(market.change24h)}</td>
                    <td className="number-cell column-wide">{formatCurrency(market.volume24h)}</td>
                    <td className="number-cell column-wide">{formatCurrency(market.marketCap)}</td>
                    <td className="number-cell column-derivative">{formatCurrency(market.openInterest)}</td>
                    <td className={`number-cell column-derivative value-${valueTone(market.fundingRate)}`}>
                      {formatPercent(market.fundingRate, 4)}
                    </td>
                    <td className={`number-cell column-wide value-${oiTone}`}>
                      {formatPercent(market.openInterestChange24h)}
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!loading && markets.length === 0 ? (
        <div className="table-empty">No markets match the current filters.</div>
      ) : null}
    </div>
  );
}
