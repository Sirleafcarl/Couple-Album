import type { AlbumYear } from '@memory/contracts/albums';

export function AlbumYearPicker({
  years,
  selectedYear,
  onSelect,
}: {
  years: AlbumYear[];
  selectedYear: number | null;
  onSelect(year: number): void;
}) {
  return (
    <nav aria-label="相册年份" className="album-year-picker">
      {years.map(({ year, albums }) => (
        <button
          aria-label={`查看 ${year} 年`}
          aria-pressed={selectedYear === year}
          key={year}
          onClick={() => onSelect(year)}
          type="button"
        >
          <strong>{year}</strong>
          <span>{albums.length} 本</span>
        </button>
      ))}
    </nav>
  );
}
