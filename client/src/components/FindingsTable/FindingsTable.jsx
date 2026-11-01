import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Eye, 
  Tag, 
  AlertOctagon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
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
    return findings.sort((a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99));
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
  const domains = [...new Set(allFindings.map((f) => f.domain).filter(Boolean))];

  const handleFilter = (key, val) => {
    setFilter((p) => ({ ...p, [key]: val }));
    setPage(0);
  };

  return (
    <div className="findings-table">
      {/* Sticky Glass Filter Toolbar */}
      <div className="findings-table__toolbar glass-panel">
        <div className="findings-table__search-wrapper">
          <Search size={15} className="findings-table__search-icon" />
          <input
            type="text"
            className="findings-table__search glass-input"
            placeholder="Search forensic findings, descriptions or citations…"
            value={filter.search}
            onChange={(e) => handleFilter('search', e.target.value)}
          />
        </div>

        <div className="findings-table__filter-group">
          <select
            className="findings-table__select glass-input"
            value={filter.domain}
            onChange={(e) => handleFilter('domain', e.target.value)}
          >
            <option value="all">All Domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>

          <select
            className="findings-table__select glass-input"
            value={filter.severity}
            onChange={(e) => handleFilter('severity', e.target.value)}
          >
            <option value="all">All Severities</option>
            {['P0', 'P1', 'P2', 'P3'].map((s) => (
              <option key={s} value={s}>
                {s} — {SEV_LABELS[s]}
              </option>
            ))}
          </select>

          <div className="findings-table__counter-pill tabular-nums">
            Showing <strong>{filtered.length}</strong> of <strong>{allFindings.length}</strong> Findings
          </div>
        </div>
      </div>

      {/* High-Contrast Table */}
      <div className="findings-table__container glass-panel">
        <table className="findings-table__table">
          <thead>
            <tr>
              <th style={{ width: '110px' }}>SEVERITY</th>
              <th style={{ width: '130px' }}>DOMAIN</th>
              <th>FORENSIC FINDING TITLE</th>
              <th style={{ width: '100px', textAlign: 'center' }}>CITATIONS</th>
              <th style={{ width: '80px', textAlign: 'right' }}>INSPECT</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={5} className="findings-table__no-data">
                  <AlertOctagon size={28} />
                  <div>No findings matching your criteria in this audit.</div>
                </td>
              </tr>
            ) : (
              paged.map((f) => {
                const isExp = expanded === f.id;
                const sevClass = `findings-sev--${(f.severity || 'p3').toLowerCase()}`;

                return (
                  <React.Fragment key={f.id}>
                    <tr
                      className={`findings-table__row ${isExp ? 'findings-table__row--expanded' : ''} ${sevClass}`}
                      onClick={() => setExpanded(isExp ? null : f.id)}
                    >
                      <td>
                        <span className={`findings-sev-pill ${sevClass} tabular-nums`}>
                          {f.severity}
                        </span>
                      </td>
                      <td className="findings-table__domain">
                        {f.domain ? f.domain.toUpperCase() : 'GENERAL'}
                      </td>
                      <td className="findings-table__title">
                        <span className="findings-table__title-text">{f.title}</span>
                      </td>
                      <td className="findings-table__citations">
                        {f.citations?.length > 0 ? (
                          <span className="findings-table__cite-badge tabular-nums">
                            {f.citations.length}
                          </span>
                        ) : (
                          <span className="findings-table__cite-none">—</span>
                        )}
                      </td>
                      <td className="findings-table__inspect">
                        <span className="findings-table__inspect-btn">
                          {isExp ? <ChevronUp size={14} /> : <Eye size={14} />}
                        </span>
                      </td>
                    </tr>

                    {/* Expandable Evidence Drawer */}
                    {isExp && (
                      <tr className="findings-table__drawer-row">
                        <td colSpan={5} className="findings-table__drawer-cell">
                          <div className={`findings-table__drawer-box ${sevClass}`}>
                            <div className="findings-table__drawer-grid">
                              {/* Left Column: Description & Analysis */}
                              <div className="findings-table__drawer-left">
                                <div className="findings-table__section">
                                  <div className="findings-table__section-label">DESCRIPTION & CONTEXT</div>
                                  <div className="findings-table__section-body">{f.description}</div>
                                </div>

                                {f.evidence && (
                                  <div className="findings-table__section">
                                    <div className="findings-table__section-label">FORENSIC IMPACT ANALYSIS</div>
                                    <div className="findings-table__section-body">{f.evidence}</div>
                                  </div>
                                )}

                                {f.tags?.length > 0 && (
                                  <div className="findings-table__tags">
                                    {f.tags.map((t) => (
                                      <span key={t} className="findings-table__tag">
                                        <Tag size={10} />
                                        <span>{t}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Right Column: Grounded Citations */}
                              <div className="findings-table__drawer-right">
                                <div className="findings-table__section-label">
                                  GROUNDED SOURCE CITATIONS ({f.citations?.length || 0})
                                </div>
                                {f.citations?.length > 0 ? (
                                  <div className="findings-table__citation-list">
                                    {f.citations.map((c, i) => (
                                      <div key={i} className="findings-table__citation-card">
                                        <div className="findings-table__cite-header">
                                          <div className="findings-table__cite-file">
                                            <FileText size={13} />
                                            <span>{c.file}</span>
                                          </div>
                                          {c.page && (
                                            <span className="findings-table__cite-page tabular-nums">
                                              Page {c.page}
                                            </span>
                                          )}
                                        </div>
                                        {c.quote && (
                                          <blockquote className="findings-table__quote">
                                            "{c.quote}"
                                          </blockquote>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="findings-table__citation-empty">
                                    Synthesized finding derived across composite document heuristics.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="findings-table__pagination">
          <button
            className="findings-table__page-btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft size={14} />
            <span>Previous</span>
          </button>
          <span className="findings-table__page-indicator tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="findings-table__page-btn"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
