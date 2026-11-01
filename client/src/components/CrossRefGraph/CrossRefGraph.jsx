import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GitCommitHorizontal, GitMerge, Network, ShieldAlert } from 'lucide-react';
import './CrossRefGraph.css';

const SEV_COLORS = {
  P0: 'var(--risk-p0, #F43F5E)',
  P1: 'var(--risk-p1, #F97316)',
  P2: 'var(--risk-p2, #F59E0B)',
  P3: 'var(--risk-p3, #10B981)',
};

const DOMAIN_COLORS = {
  legal: 'var(--domain-legal, #38BDF8)',
  finance: 'var(--domain-finance, #10B981)',
  commercial: 'var(--domain-commercial, #6366F1)',
  tech: 'var(--domain-tech, #818CF8)',
  cyber: 'var(--domain-cyber, #F43F5E)',
  hr: 'var(--domain-hr, #EC4899)',
  tax: 'var(--domain-tax, #F59E0B)',
  regulatory: 'var(--domain-regulatory, #14B8A6)',
  esg: 'var(--domain-esg, #84CC16)',
};

export default function CrossRefGraph({ crossReferences = [], domainFindings = {} }) {
  const svgRef = useRef(null);

  // Collect all referenced finding IDs
  const allFindings = {};
  Object.values(domainFindings).forEach((df) => {
    df?.findings?.forEach((f) => {
      allFindings[f.id] = f;
    });
  });

  useEffect(() => {
    if (!svgRef.current || crossReferences.length === 0) return;

    const container = svgRef.current.parentElement;
    const W = container.clientWidth || 700;
    const H = 440;

    const nodeIds = new Set();
    crossReferences.forEach((xr) => {
      nodeIds.add(xr.finding1_id);
      nodeIds.add(xr.finding2_id);
    });

    const nodes = [...nodeIds].map((id) => {
      const f = allFindings[id] || { id, severity: 'P2', domain: 'unknown', title: id.slice(0, 8) };
      return { 
        id, 
        severity: f.severity || 'P2', 
        domain: f.domain || 'general', 
        title: f.title || id.slice(0, 12) 
      };
    });

    const links = crossReferences.map((xr) => ({
      source: xr.finding1_id,
      target: xr.finding2_id,
      severity: xr.combined_severity || 'P1',
      narrative: xr.narrative,
    }));

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', W)
      .attr('height', H)
      .attr('viewBox', `0 0 ${W} ${H}`);

    // Glow filter and marker defs
    const defs = svg.append('defs');

    const filter = defs.append('filter')
      .attr('id', 'node-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#38BDF8');

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(130))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(32));

    const link = svg.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', (d) => (d.severity === 'P0' ? '#F43F5E' : '#38BDF8'))
      .attr('stroke-width', (d) => (d.severity === 'P0' ? 2.5 : 1.5))
      .attr('stroke-opacity', 0.65)
      .attr('stroke-dasharray', (d) => (d.severity === 'P0' ? 'none' : '4 2'))
      .attr('marker-end', 'url(#arrow)');

    const node = svg.append('g')
      .selectAll('g').data(nodes).join('g')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    // Node outer neon ring
    node.append('circle')
      .attr('r', 16)
      .attr('fill', (d) => 'rgba(7, 10, 16, 0.95)')
      .attr('stroke', (d) => (d.severity === 'P0' ? '#F43F5E' : '#38BDF8'))
      .attr('stroke-width', 2)
      .attr('filter', 'url(#node-glow)');

    node.append('text')
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-weight', '700')
      .attr('fill', '#F8FAFC')
      .text((d) => d.severity);

    // Tooltip
    const tooltip = d3.select(svgRef.current.parentElement)
      .append('div').attr('class', 'crossref-tooltip').style('opacity', 0);

    node.on('mouseover', (event, d) => {
      tooltip.transition().duration(150).style('opacity', 1);
      tooltip.html(`
        <div class="crossref-tooltip__header">
          <span class="crossref-tooltip__domain">${d.domain.toUpperCase()}</span>
          <span class="crossref-tooltip__sev">${d.severity}</span>
        </div>
        <div class="crossref-tooltip__title">${d.title}</div>
        <div class="crossref-tooltip__id tabular-nums">${d.id.slice(0, 12)}…</div>
      `)
        .style('left', (event.offsetX + 14) + 'px')
        .style('top', (event.offsetY - 14) + 'px');
    }).on('mouseout', () => tooltip.transition().duration(200).style('opacity', 0));

    sim.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
      tooltip.remove();
    };
  }, [crossReferences, domainFindings]);

  if (crossReferences.length === 0) {
    return (
      <div className="crossref-empty glass-panel">
        <div className="crossref-empty__icon-well">
          <GitMerge size={32} />
        </div>
        <h3>No Compound Dependencies Detected</h3>
        <p>The 9 autonomous agents detected isolated domain risks without cross-domain cascade liability.</p>
      </div>
    );
  }

  return (
    <div className="crossref-wrapper">
      <div className="crossref-graph glass-panel">
        <div className="crossref-graph__header">
          <div className="crossref-graph__title">
            <Network size={16} />
            <span>CROSS-DOMAIN COMPOUND RISK TOPOLOGY</span>
          </div>
          <span className="crossref-graph__counter tabular-nums">
            {crossReferences.length} Multi-Vector {crossReferences.length === 1 ? 'Link' : 'Links'}
          </span>
        </div>

        <div className="crossref-graph__viewport">
          <svg ref={svgRef} />
        </div>

        <div className="crossref-legend">
          {Object.entries(DOMAIN_COLORS).map(([d, c]) => (
            <span key={d} className="crossref-legend__item">
              <span className="crossref-legend__dot" style={{ background: c }} />
              <span>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Compound Liability Cards */}
      <div className="crossref-cards-section">
        <div className="crossref-cards-header">
          <ShieldAlert size={15} />
          <span>SYNTHESIZED COMPOUND RISKS & SYSTEMIC EXPOSURE</span>
        </div>

        <div className="crossref-cards-grid">
          {crossReferences.map((xr, idx) => {
            const f1 = allFindings[xr.finding1_id] || { domain: 'Domain A', title: xr.finding1_id.slice(0, 10) };
            const f2 = allFindings[xr.finding2_id] || { domain: 'Domain B', title: xr.finding2_id.slice(0, 10) };
            const combinedSev = xr.combined_severity || 'P1';

            return (
              <div key={idx} className="crossref-card glass-panel glass-panel--interactive">
                <div className="crossref-card__header">
                  <div className="crossref-card__domains">
                    <span className="crossref-domain-pill">{f1.domain || 'Domain 1'}</span>
                    <GitCommitHorizontal size={14} className="crossref-card__arrow" />
                    <span className="crossref-domain-pill">{f2.domain || 'Domain 2'}</span>
                  </div>
                  <span className={`crossref-card__sev-pill findings-sev--${combinedSev.toLowerCase()} tabular-nums`}>
                    COMPOUND {combinedSev}
                  </span>
                </div>

                <div className="crossref-card__titles">
                  <div className="crossref-card__finding-title">
                    <span className="crossref-title-bullet">•</span> {f1.title}
                  </div>
                  <div className="crossref-card__finding-title">
                    <span className="crossref-title-bullet">•</span> {f2.title}
                  </div>
                </div>

                {xr.narrative && (
                  <p className="crossref-card__narrative">
                    {xr.narrative}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
