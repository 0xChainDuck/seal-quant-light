const TOKEN_COLORS = ['#2f7cf6', '#00a884', '#d8912f', '#d64c7f', '#7b61d1', '#3d98a7'];

function colorFor(symbol: string): string {
  const seed = [...symbol].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return TOKEN_COLORS[seed % TOKEN_COLORS.length] ?? TOKEN_COLORS[0]!;
}

export function TokenAvatar({ symbol, size = 'md' }: { symbol: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`token-avatar token-avatar-${size}`}
      style={{ backgroundColor: colorFor(symbol) }}
    >
      {symbol.slice(0, 2)}
    </span>
  );
}
