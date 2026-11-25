import { memo, useState, useMemo } from 'react';

export const DataTable = memo(function DataTable({
  columns = [],
  data = [],
  rowKey = 'id',
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No records found.',
  onRowClick,
  pageSize = 10
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');

  const filteredData = useMemo(() => {
    let result = data;
    if (searchable && searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const val = row[col.key];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(term);
        })
      );
    }

    if (sortField) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        return sortDirection === 'asc' ? 1 : -1;
      });
    }

    return result;
  }, [data, searchable, searchTerm, columns, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  return (
    <div className="data-table-container">
      {searchable && (
        <div className="data-table-toolbar">
          <input
            type="search"
            className="data-table-search"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.sortable !== false ? { cursor: 'pointer' } : undefined}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {col.title}
                    {col.sortable !== false && sortField === col.key && (
                      <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row, idx) => {
                const key = typeof rowKey === 'function' ? rowKey(row) : (row[rowKey] || idx);
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    style={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {columns.map((col) => (
                      <td key={col.key}>
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="data-table-pagination">
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Showing {Math.min(filteredData.length, (currentPage - 1) * pageSize + 1)}–
            {Math.min(filteredData.length, currentPage * pageSize)} of {filteredData.length}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 13, fontWeight: 600 }}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
