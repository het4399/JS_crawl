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
  const currentTransformRef = useRef<d3.ZoomTransform | null>(null);
  const stableCenterRef = useRef<{ x: number; y: number } | null>(null);
  const clickGuardRef = useRef<boolean>(false);
  const uidRef = useRef<number>(0);

  useEffect(() => {
    if (!data || !ref.current) return;

    const root = d3.hierarchy<TreeNode>(data, d => d.children);

    // Assign stable IDs to data (persist across updates)
    (root as any).eachBefore((n: any) => {
      if (n.data && n.data.__uid == null) {
        uidRef.current += 1;
        n.data.__uid = uidRef.current;
      }
      n.id = n.data.__uid;
    });

    // Show all levels initially; no depth limit
    (root as any).descendants().forEach((d: any) => {
      d._children = d.children;
      // Keep children visible initially (don't collapse)
      d.children = d.children;
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

    // Zoom + pan with transform preservation
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .on('zoom', (event: any) => {
        currentTransformRef.current = event.transform;
        gZoom.attr('transform', event.transform.toString());
      });
    
    svg.call(zoomBehavior);
    
    // Restore previous transform if available
    if (currentTransformRef.current) {
      svg.call(zoomBehavior.transform as any, currentTransformRef.current);
    }

    const tree = d3.tree<TreeNode>().nodeSize(orientation === 'horizontal' ? [dx, dy] : [dy, dx]);
    const diagonal = orientation === 'horizontal'
      ? d3.linkHorizontal<any, any>().x(d => (d as any).y).y(d => (d as any).x)
      : d3.linkVertical<any, any>().x(d => (d as any).x).y(d => (d as any).y);

    let index = 0 as any;
    (root as any).x0 = 0;
    (root as any).y0 = 0;

    didCenterRef.current = false;
    stableCenterRef.current = null; // Reset stable center for new data
    update(root as any);

    function update(source: any) {
      const nodes = (root as any).descendants().reverse();
      const links = (root as any).links();

      // Store current transform before layout changes
      const currentTransform = currentTransformRef.current || d3.zoomIdentity;

      tree(root as any);

      let left: any = root, right: any = root;
      (root as any).eachBefore((n: any) => {
        if (n.x < left.x) left = n;
        if (n.x > right.x) right = n;
      });

      // Center vertically by shifting inner group; keep viewBox constant
      if (!didCenterRef.current || recenterKey !== undefined) {
        const centerOffset = orientation === 'horizontal'
          ? (height / 2) - ((left.x + right.x) / 2)
          : (height / 2) - ((left.y + right.y) / 2);
        const topPadding = orientation === 'vertical' ? (dx * 1.5) : 0; // give extra height above root
        
        // Store stable center for future updates
        stableCenterRef.current = {
          x: orientation === 'horizontal' ? 0 : centerOffset + topPadding,
          y: orientation === 'horizontal' ? centerOffset + topPadding : 0
        };
        
        g.attr('transform', `translate(${stableCenterRef.current.x}, ${stableCenterRef.current.y})`);
        didCenterRef.current = true;
      } else if (stableCenterRef.current) {
        // Use stable center to prevent jumping
        g.attr('transform', `translate(${stableCenterRef.current.x}, ${stableCenterRef.current.y})`);
      }

      // Restore the zoom/pan transform to prevent jumping
      gZoom.attr('transform', currentTransform.toString());

      const node = g.selectAll<SVGGElement, any>('g.node')
        .data(nodes, (d: any) => d.data.__uid);

      const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr('transform', () => `translate(${source.y0},${source.x0})`)
        .attr('cursor', 'pointer');

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

      // Merge selection for all nodes (existing + new)
      const nodeUpdate = (nodeEnter as any).merge(node as any);

      // Ensure clicks work on all nodes (not just newly entered)
      nodeUpdate.on('click', null).on('click', (_event: any, d: any) => {
        _event.stopPropagation();
        
        // Toggle children
        if (d.children) {
          d._children = d.children;
          d.children = null;
        } else {
          d.children = d._children;
          d._children = null;
        }
        
        if (onSelectPath) {
          const path: string[] = [];
          let p: any = d;
          while (p) { path.unshift(p.data?.text ?? ''); p = p.parent; }
          onSelectPath(path);
        }
        
        // Re-render without transition to avoid flicker
        update(d);
      });

      // Apply instant positioning (no transition)
      nodeUpdate.attr('transform', (d: any) => orientation === 'horizontal' ? `translate(${d.y},${d.x})` : `translate(${d.x},${d.y})`);

      nodeUpdate.select('circle')
        .attr('r', 6)
        .attr('fill', (d: any) => d._children && !d.children ? '#6b7280' : '#3b82f6')
        .style('cursor', 'pointer');

      const nodeExit = node.exit().remove();

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

      (link as any).merge(linkEnter as any).attr('d', diagonal as any);
      link.exit().remove();

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


