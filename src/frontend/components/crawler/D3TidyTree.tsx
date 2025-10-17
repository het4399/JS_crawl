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
  expandAll?: boolean; // if true, expand all nodes
}

export default function D3TidyTree({ data, height = 600, orientation = 'horizontal', dx: dxProp, dy: dyProp, onSelectPath, recenterKey, expandAll = false }: D3TidyTreeProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const didCenterRef = useRef<boolean>(false);
  const currentTransformRef = useRef<d3.ZoomTransform | null>(null);
  const stableCenterRef = useRef<{ x: number; y: number } | null>(null);
  const clickGuardRef = useRef<boolean>(false);
  const collapsedByKeyRef = useRef<Map<string, boolean>>(new Map());
  const lastFocusedNodeKeyRef = useRef<string | null>(null);
  const prevSnapshotRef = useRef<{
    dataHash: string;
    height: number;
    orientation: 'horizontal' | 'vertical';
    dx?: number;
    dy?: number;
    recenterKey?: number;
  } | null>(null);

  useEffect(() => {
    if (!data || !ref.current) return;

    // Avoid rebuilding the tree when the parent recreates the same data by reference.
    // Serialize only necessary fields for a stable hash.
    const dataHash = JSON.stringify(data);
    const snapshot = { dataHash, height, orientation, dx: dxProp, dy: dyProp, recenterKey, expandAll };
    if (prevSnapshotRef.current
      && prevSnapshotRef.current.dataHash === (snapshot as any).dataHash
      && prevSnapshotRef.current.height === (snapshot as any).height
      && prevSnapshotRef.current.orientation === (snapshot as any).orientation
      && prevSnapshotRef.current.dx === (snapshot as any).dx
      && prevSnapshotRef.current.dy === (snapshot as any).dy
      && prevSnapshotRef.current.recenterKey === (snapshot as any).recenterKey
      && (prevSnapshotRef.current as any).expandAll === expandAll) {
      // Nothing material changed; skip rebuild to prevent jitter
      return;
    }
    prevSnapshotRef.current = snapshot as any;

    const root = d3.hierarchy<TreeNode>(data, d => d.children);

    // Assign stable keys based on the textual path to persist across updates
    (root as any).eachBefore((n: any) => {
      const parentKey = n.parent?.data?.__key || '';
      const myLabel = (n.data?.text ?? '').replace(/\s+/g, ' ').trim();
      // Use internal type markers if provided (from conversion), else default to 'url'
      const typeTag = (n.data && (n.data as any).__type) ? String((n.data as any).__type) : 'url';
      const myKey = parentKey ? `${parentKey} > ${typeTag}:${myLabel}` : `${typeTag}:${myLabel}`;
      n.data.__key = myKey;
      n.id = myKey;
    });

    // Helper collapse/expand utilities
    function collapse(d: any) {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      }
    }

    function expand(d: any) {
      if (d._children) {
        d.children = d._children;
        d._children = null;
      }
    }

    // Assign hidden storage for children; restore previous collapsed state if known
    (root as any).descendants().forEach((d: any) => {
      d._children = d._children || d.children;
      const key = d.data.__key;
      
      // If expandAll is true, force all nodes to be expanded
      if (expandAll) {
        d.children = d._children;
        collapsedByKeyRef.current.set(key, false);
      } else {
        const state = collapsedByKeyRef.current.get(key);
        if (state === true) {
          d.children = null; // explicitly collapsed
        } else if (state === false) {
          d.children = d._children; // explicitly expanded
        } else {
          // No stored state; default by depth to avoid expanding whole tree and flicker
          d.children = d.depth > 1 ? null : d._children;
          // Seed the map so subsequent renders are stable
          collapsedByKeyRef.current.set(key, d.depth > 1);
        }
      }
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

    // Preserve previous centering/transform across renders
    // Choose update source: last focused node if available, else root
    let updateSource: any = root;
    if (lastFocusedNodeKeyRef.current) {
      const match = (root as any).descendants().find((n: any) => n.data.__key === lastFocusedNodeKeyRef.current);
      if (match) updateSource = match;
    }
    update(updateSource as any);

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

      // Key nodes by both path key and a stable type to prevent SEO keyword
      // synthetic nodes from colliding with URL path nodes that share labels.
      const node = g.selectAll<SVGGElement, any>('g.node')
        .data(nodes, (d: any) => `${d.data.__key || d.data.text}`);

      const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr('transform', () => `translate(${orientation === 'horizontal' ? source.y0 : source.x0},${orientation === 'horizontal' ? source.x0 : source.y0})`)
        .attr('cursor', 'pointer')
        .on('dblclick', (_event: any, d: any) => {
          // Guard so the single-click handler below does not also run
          clickGuardRef.current = true;
          // Collapse/expand entire subtree on double click
          _event.stopPropagation();
          // If leaf, do nothing
          if (!d.children && !d._children) {
            setTimeout(() => { clickGuardRef.current = false; }, 0);
            return;
          }
          const willCollapse = !!d.children; // if currently expanded, collapse subtree
          (d as any).each((n: any) => {
            if (willCollapse) {
              collapsedByKeyRef.current.set(n.data.__key, true);
              n._children = n._children || n.children;
              n.children = null;
            } else {
              collapsedByKeyRef.current.set(n.data.__key, false);
              if (n._children) {
                n.children = n._children;
                n._children = null;
              }
            }
          });
          lastFocusedNodeKeyRef.current = d.data.__key;
          update(d);
          // Release the guard shortly after to allow future clicks
          setTimeout(() => { clickGuardRef.current = false; }, 0);
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

      // Merge selection for all nodes (existing + new)
      const nodeUpdate = (nodeEnter as any).merge(node as any);

      // Ensure clicks work on all nodes (not just newly entered)
      nodeUpdate.on('click', null).on('click', (_event: any, d: any) => {
        _event.stopPropagation();
        if (clickGuardRef.current) return; // skip if dblclick just fired
        // If leaf, don't mutate tree structure
        if (!d.children && !d._children) {
          const isUrlNode = (d.data && (d.data as any).__type) ? String((d.data as any).__type) === 'url' : true;
          if (onSelectPath && isUrlNode) {
            const path: string[] = [];
            let p: any = d;
            while (p) { path.unshift(p.data?.text ?? ''); p = p.parent; }
            onSelectPath(path);
          }
          return;
        }
        // Toggle children
        if (d.children) {
          collapsedByKeyRef.current.set(d.data.__key, true);
          d._children = d.children;
          d.children = null;
        } else {
          collapsedByKeyRef.current.set(d.data.__key, false);
          d.children = d._children;
          d._children = null;
        }
        
        const isUrlNode2 = (d.data && (d.data as any).__type) ? String((d.data as any).__type) === 'url' : true;
        if (onSelectPath && isUrlNode2) {
          const path: string[] = [];
          let p: any = d;
          while (p) { path.unshift(p.data?.text ?? ''); p = p.parent; }
          onSelectPath(path);
        }
        lastFocusedNodeKeyRef.current = d.data.__key;
        // Re-render
        // Update from clicked node only, do not rebuild from root
        update(d);
      });

      // Smooth transition positioning
      const transition = (svg as any).transition().duration(250);
      nodeEnter.transition(transition)
        .attr('transform', (d: any) => orientation === 'horizontal' ? `translate(${d.y},${d.x})` : `translate(${d.x},${d.y})`);
      (nodeUpdate as any).transition(transition)
        .attr('transform', (d: any) => orientation === 'horizontal' ? `translate(${d.y},${d.x})` : `translate(${d.x},${d.y})`);

      nodeUpdate.select('circle')
        .attr('r', 6)
        .attr('fill', (d: any) => d._children && !d.children ? '#6b7280' : '#3b82f6')
        .style('cursor', 'pointer');

      node.exit().transition(transition)
        .attr('transform', () => `translate(${orientation === 'horizontal' ? source.y : source.x},${orientation === 'horizontal' ? source.x : source.y})`)
        .remove();

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

      (link as any).merge(linkEnter as any).transition(transition).attr('d', diagonal as any);
      link.exit().transition(transition).remove();

      (root as any).eachBefore((d: any) => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
      // Note: Auto-centering on node interaction is intentionally disabled to avoid view jumps
    }
  }, [data, height, orientation, dxProp, dyProp, recenterKey]);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
      <svg ref={ref} width="100%" height={height} role="img" aria-label="Web hierarchy tree" style={{ display: 'block', borderRadius: 12 }} />
    </div>
  );
}


