import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import './CrossRefGraph.css';

const SEV_COLORS = { P0: '#ef4444', P1: '#f97316', P2: '#eab308', P3: '#22c55e' };
const DOMAIN_COLORS = {
  legal: '#818cf8', finance: '#34d399', commercial: '#60a5fa', tech: '#a78bfa',
  cyber: '#f87171', hr: '#fb923c', tax: '#facc15', regulatory: '#4ade80', esg: '#2dd4bf',
};

export default function CrossRefGraph({ crossReferences = [], domainFindings = {} }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || crossReferences.length === 0) return;

    const container = svgRef.current.parentElement;
    const W = container.clientWidth || 600;
    const H = 400;

    // Collect all referenced finding IDs
    const allFindings = {};
    Object.values(domainFindings).forEach((df) => {
      df?.findings?.forEach((f) => { allFindings[f.id] = f; });
    });

    const nodeIds = new Set();
    crossReferences.forEach((xr) => {
      nodeIds.add(xr.finding1_id);
      nodeIds.add(xr.finding2_id);
    });

    const nodes = [...nodeIds].map((id) => {
      const f = allFindings[id] || { id, severity: 'P2', domain: 'unknown', title: id.slice(0, 8) };
      return { id, severity: f.severity, domain: f.domain, title: f.title?.slice(0, 30) || id.slice(0, 8) };
    });

    const links = crossReferences.map((xr) => ({
      source: xr.finding1_id,
      target: xr.finding2_id,
      severity: xr.combined_severity,
      narrative: xr.narrative,
    }));

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', W)
      .attr('height', H)
      .attr('viewBox', `0 0 ${W} ${H}`);

    // Defs — arrow marker
    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#475569');

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(30));

    const link = svg.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', (d) => SEV_COLORS[d.severity] || '#475569')
      .attr('stroke-width', (d) => d.severity === 'P0' ? 2.5 : 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrow)');

    const node = svg.append('g')
      .selectAll('g').data(nodes).join('g')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.append('circle')
      .attr('r', 14)
      .attr('fill', (d) => DOMAIN_COLORS[d.domain] || '#94a3b8')
      .attr('stroke', (d) => SEV_COLORS[d.severity] || '#fff')
      .attr('stroke-width', 2)
      .attr('opacity', 0.9);

    node.append('text')
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#0a0d14')
      .attr('font-weight', '700')
      .text((d) => d.severity);

    // Tooltip
    const tooltip = d3.select(svgRef.current.parentElement)
      .append('div').attr('class', 'crossref-tooltip').style('opacity', 0);

    node.on('mouseover', (event, d) => {
      tooltip.transition().duration(150).style('opacity', 1);
      tooltip.html(`<strong>${d.title}</strong><br/><span>${d.domain} · ${d.severity}</span>`)
        .style('left', (event.offsetX + 12) + 'px')
        .style('top', (event.offsetY - 12) + 'px');
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
      <div className="crossref-empty">
        <div className="crossref-empty__icon">🔗</div>
        <p>No cross-domain connections detected.</p>
      </div>
    );
  }

  return (
    <div className="crossref-graph">
      <svg ref={svgRef} />
      <div className="crossref-legend">
        {Object.entries(DOMAIN_COLORS).map(([d, c]) => (
          <span key={d} className="crossref-legend__item">
            <span className="crossref-legend__dot" style={{ background: c }} />
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}
