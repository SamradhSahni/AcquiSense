import React, { useState, useMemo } from 'react';
import './FindingsTable.css';

const SEV_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const SEV_LABELS = { P0: 'Critical', P1: 'High', P2: 'Medium', P3: 'Low' };

export default function FindingsTable({ domainFindings = {} }) {
  const [filter, setFilter] = useState({ domain: 'all', severity: 'all', search: '' });
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const allFindings = useMemo(() => {
    const findings = [];
    Object.values(domainFindings).forEach((df) => {
      if (df?.findings) findings.push(...df.findings);
    });
    return findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  }, [domainFindings]);

  const filtered = useMemo(() => {
    return allFindings.filter((f) => {
      if (filter.domain !== 'all' && f.domain !== filter.domain) return false;
      if (filter.severity !== 'all' && f.severity !== filter.severity) return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        return f.title?.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allFindings, filter]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const domains = [...new Set(allFindings.map((f) => f.domain))];

  const handleFilter = (key, val) => { setFilter((p) => ({ ...p, [key]: val })); setPage(0); };

  return (
    <div className="findings-table">
      {/* Filters */}
      <div className="findings-table__filters">
        <input
          type="text"
          className="findings-table__search"
          placeholder="🔍  Search findings…"
          value={filter.search}
          onChange={(e) => handleFilter('search', e.target.value)}
        />
        <select className="findings-table__select" value={filter.domain} onChange={(e) => handleFilter('domain', e.target.value)}>
          <option value="all">All Domains</option>
          {domains.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
        </select>
        <select className="findings-table__select" value={filter.severity} onChange={(e) => handleFilter('severity', e.target.value)}>
          <option value="all">All Severities</option>
          {['P0', 'P1', 'P2', 'P3'].map((s) => <option key={s} value={s}>{s} — {SEV_LABELS[s]}</option>)}
        </select>
        <span className="findings-table__count">{filtered.length} findings</span>
      </div>

      {/* Table */}
      <div className="findings-table__container">
        <table className="findings-table__table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Domain</th>
              <th>Finding</th>
              <th>Citations</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px' }}>
                No findings match your filters.
              </td></tr>
            ) : paged.map((f) => (
              <React.Fragment key={f.id}>
                <tr className="findings-table__row" onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
                  <td>
                    <span className={`findings-table__sev badge badge-${f.severity.toLowerCase()}`}>
                      {f.severity}
                    </span>
                  </td>
                  <td className="findings-table__domain">
                    {f.domain?.charAt(0).toUpperCase() + f.domain?.slice(1)}
                  </td>
                  <td className="findings-table__title">
                    {f.title}
                    <span className="findings-table__expand-icon">{expanded === f.id ? '▲' : '▼'}</span>
                  </td>
                  <td className="findings-table__citations">
                    {f.citations?.length > 0 && (
                      <span className="findings-table__cite-count">{f.citations.length}</span>
                    )}
                  </td>
                </tr>

                {/* Expanded detail */}
                {expanded === f.id && (
                  <tr className="findings-table__detail">
                    <td colSpan={4}>
                      <div className="findings-table__detail-content">
                        <div className="findings-table__detail-section">
                          <div className="findings-table__detail-label">Description</div>
                          <div className="findings-table__detail-text">{f.description}</div>
                        </div>
                        <div className="findings-table__detail-section">
                          <div className="findings-table__detail-label">Evidence &amp; Analysis</div>
                          <div className="findings-table__detail-text">{f.evidence}</div>
                        </div>
                        {f.citations?.length > 0 && (
                          <div className="findings-table__detail-section">
                            <div className="findings-table__detail-label">Citations</div>
                            {f.citations.map((c, i) => (
                              <div key={i} className="findings-table__citation">
                                <span className="findings-table__cite-file">{c.file}</span>
                                <span className="findings-table__cite-page">p.{c.page}</span>
                                {c.quote && (
                                  <blockquote className="findings-table__quote">"{c.quote}"</blockquote>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {f.tags?.length > 0 && (
                          <div className="findings-table__tags">
                            {f.tags.map((t) => <span key={t} className="findings-table__tag">{t}</span>)}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="findings-table__pagination">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next →</button>
        </div>
      )}
    </div>
  );
}
