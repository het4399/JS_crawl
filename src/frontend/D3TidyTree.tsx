import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export type TreeNode = { text: string; children?: TreeNode[] };

interface D3TidyTreeProps {
  data: TreeNode;
  height?: number;
  orientation?: 'horizontal' | 'vertical';
  dx?: number; // vertical spacing between nodes
  dy?: number; // horizontal spacing between nodes
  onSelectPath?: (path: string[]) => void;
  recenterKey?: number; // change to force recentring
}

export default function D3TidyTree({ data, height = 600, orientation = 'horizontal', dx: dxProp, dy: dyProp, onSelectPath, recenterKey }: D3TidyTreeProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const didCenterRef = useRef<boolean>(false);

  useEffect(() => {
    if (!data || !ref.current) return;

    const root = d3.hierarchy<TreeNode>(data, d => d.children);

    // Collapse everything except root and its direct children initially
    (root as any).descendants().forEach((d: any) => {
      d._children = d.children;
      if (d.depth > 1) d.children = null;
    });

    const width = Math.min(1000, (root.height + 1) * 220);
    const dx = dxProp ?? 28;
    const dy = dyProp ?? 180;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    // Fixed viewBox; avoid resetting during updates to prevent jumps
    svg
      .attr('viewBox', [0, 0, width, height])
      .style('font', '14px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif')
      .style('user-select', 'none')
      .style('background', 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)')
      .style('border-radius', '8px');

    // Separate groups: outer handles zoom, inner handles centering
    const gZoom = svg.append('g');
    const g = gZoom.append('g');

    // Zoom + pan
    svg.call(
      d3.zoom<SVGSVGElement, unknown>().on('zoom', (event: any) => {
        gZoom.attr('transform', (event.transform as any).toString());
      })
    );

    const tree = d3.tree<TreeNode>().nodeSize(orientation === 'horizontal' ? [dx, dy] : [dy, dx]);
    const diagonal = orientation === 'horizontal'
      ? d3.linkHorizontal<any, any>().x(d => (d as any).y).y(d => (d as any).x)
      : d3.linkVertical<any, any>().x(d => (d as any).x).y(d => (d as any).y);

    let index = 0 as any;
    (root as any).x0 = 0;
    (root as any).y0 = 0;

    didCenterRef.current = false;
    update(root as any);

    function update(source: any) {
      const duration = 250;
      const nodes = (root as any).descendants().reverse();
      const links = (root as any).links();

      tree(root as any);

      let left: any = root, right: any = root;
      (root as any).eachBefore((n: any) => {
        if (n.x < left.x) left = n;
        if (n.x > right.x) right = n;
      });

      // Center vertically by shifting inner group; keep viewBox constant
      if (!didCenterRef.current) {
        const centerOffset = orientation === 'horizontal'
          ? (height / 2) - ((left.x + right.x) / 2)
          : (height / 2) - ((left.y + right.y) / 2);
        const topPadding = orientation === 'vertical' ? (dx * 1.5) : 0; // give extra height above root
        g.attr('transform', `translate(0, ${centerOffset + topPadding})`);
        didCenterRef.current = true;
      }

      const node = g.selectAll<SVGGElement, any>('g.node')
        .data(nodes, (d: any) => d.id || (d.id = ++index));

      const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr('transform', () => `translate(${source.y0},${source.x0})`)
        .attr('cursor', 'pointer')
        .on('click', (_event, d: any) => {
          d.children = d.children ? null : d._children;
          if (onSelectPath) {
            const path: string[] = [];
            let p: any = d;
            while (p) { path.unshift(p.data?.text ?? ''); p = p.parent; }
            onSelectPath(path);
          }
          update(d);
        });

      nodeEnter.append('circle')
        .attr('r', 1e-6)
        .attr('fill', (d: any) => d._children && !d.children ? '#6b7280' : '#3b82f6')
        .attr('stroke', (d: any) => d._children && !d.children ? '#4b5563' : '#1d4ed8')
        .attr('stroke-width', 2)
        .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');

      nodeEnter.append('text')
        .attr('dy', '0.32em')
        .attr('x', (d: any) => d._children ? -12 : 12)
        .attr('text-anchor', (d: any) => d._children ? 'end' : 'start')
        .text((d: any) => d.data.text)
        .style('font-weight', '500')
        .style('fill', '#1f2937')
        .clone(true).lower()
        .attr('stroke', 'white')
        .attr('stroke-width', 4)
        .attr('stroke-opacity', 0.8);

      const nodeUpdate = (nodeEnter as any).merge(node as any)
        .transition().duration(duration)
        .attr('transform', (d: any) => orientation === 'horizontal' ? `translate(${d.y},${d.x})` : `translate(${d.x},${d.y})`);

      nodeUpdate.select('circle')
        .attr('r', 6)
        .attr('fill', (d: any) => d._children && !d.children ? '#6b7280' : '#3b82f6')
        .style('cursor', 'pointer');

      const nodeExit = node.exit().transition().duration(duration)
        .attr('transform', () => `translate(${source.y},${source.x})`)
        .remove();

      nodeExit.select('circle').attr('r', 1e-6);
      nodeExit.select('text').style('fill-opacity', 1e-6);

      const link = g.selectAll<SVGPathElement, any>('path.link')
        .data(links, (d: any) => d.target.id);

      const linkEnter = link.enter().insert('path', 'g')
        .attr('class', 'link')
        .attr('d', () => {
          const o = orientation === 'horizontal' ? { x: (source as any).x0, y: (source as any).y0 } : { x: (source as any).y0, y: (source as any).x0 };
          return (diagonal as any)({ source: o, target: o });
        })
        .attr('fill', 'none')
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 2)
        .style('opacity', 0.7);

      (link as any).merge(linkEnter as any).transition().duration(duration)
        .attr('d', diagonal as any);

      link.exit().transition().duration(duration)
        .attr('d', () => {
          const o = orientation === 'horizontal' ? { x: (source as any).x, y: (source as any).y } : { x: (source as any).y, y: (source as any).x };
          return (diagonal as any)({ source: o, target: o });
        })
        .remove();

      (root as any).eachBefore((d: any) => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    }
  }, [data, height, orientation, dxProp, dyProp, recenterKey]);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
      <svg ref={ref} width="100%" height={height} role="img" aria-label="Web hierarchy tree" style={{ display: 'block', borderRadius: 12 }} />
    </div>
  );
}


