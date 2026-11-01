import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { Canvas, Circle, Line, Group, vec } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, useDerivedValue, runOnJS } from 'react-native-reanimated';
import * as d3Force from 'd3-force';

export interface GraphNode {
  id: string;
  title: string;
  domain: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  x: number;
  y: number;
  radius: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  legal: '#8B5CF6',
  finance: '#10B981',
  commercial: '#3B82F6',
  tech: '#06B6D4',
  cyber: '#F43F5E',
  hr: '#EC4899',
  tax: '#F59E0B',
  regulatory: '#6366F1',
  esg: '#14B8A6',
};

const SEVERITY_RADIUS: Record<string, number> = { P0: 18, P1: 14, P2: 10, P3: 7 };
const CELL_SIZE = 60; // Spatial hash cell size in canvas points

interface Props {
  width: number;
  height: number;
  nodes: Omit<GraphNode, 'x' | 'y' | 'radius'>[];
  edges: GraphEdge[];
  onSelectNode: (node: GraphNode) => void;
}

export const SkiaForceGraph: React.FC<Props> = ({
  width,
  height,
  nodes,
  edges,
  onSelectNode,
}) => {
  const [layout, setLayout] = useState<{
    simNodes: GraphNode[];
    simEdges: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  } | null>(null);

  // Spatial Grid Hash shared with UI Worklet for O(1) hit-testing [BUG-07 FIX]
  const spatialBuckets = useSharedValue<Record<string, GraphNode[]>>({});

  // Non-blocking chunked force simulation across animation frames [BUG-07 FIX]
  useEffect(() => {
    let cancelled = false;
    const simNodes: GraphNode[] = nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 120,
      y: height / 2 + (Math.random() - 0.5) * 120,
      radius: SEVERITY_RADIUS[n.severity] || 10,
    }));
    const simEdges = edges.map((e) => ({ ...e }));

    const simulation = d3Force
      .forceSimulation(simNodes as any)
      .force('link', d3Force.forceLink(simEdges).id((d: any) => d.id).distance(85))
      .force('charge', d3Force.forceManyBody().strength(-220))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .force('collide', d3Force.forceCollide().radius(24))
      .stop();

    let ticksCompleted = 0;
    const totalTicks = 200;

    function stepChunk() {
      if (cancelled) return;
      const chunkTicks = 25;
      for (let i = 0; i < chunkTicks && ticksCompleted < totalTicks; i++, ticksCompleted++) {
        simulation.tick();
      }
      if (ticksCompleted < totalTicks) {
        requestAnimationFrame(stepChunk);
      } else {
        // Build O(1) Spatial Grid Hash Index
        const buckets: Record<string, GraphNode[]> = {};
        for (const node of simNodes) {
          const minCellX = Math.floor((node.x - node.radius - 8) / CELL_SIZE);
          const maxCellX = Math.floor((node.x + node.radius + 8) / CELL_SIZE);
          const minCellY = Math.floor((node.y - node.radius - 8) / CELL_SIZE);
          const maxCellY = Math.floor((node.y + node.radius + 8) / CELL_SIZE);

          for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cy = minCellY; cy <= maxCellY; cy++) {
              const key = `${cx}:${cy}`;
              if (!buckets[key]) buckets[key] = [];
              buckets[key].push(node);
            }
          }
        }
        spatialBuckets.value = buckets;
        setLayout({
          simNodes,
          simEdges: simEdges.map((e: any) => ({
            x1: e.source.x,
            y1: e.source.y,
            x2: e.target.x,
            y2: e.target.y,
          })),
        });
      }
    }

    requestAnimationFrame(stepChunk);
    return () => {
      cancelled = true;
    };
  }, [nodes, edges, width, height]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  // [BUG-07 FIX]: Focal-Point Matrix Pinch-to-Zoom on UI Worklet
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = Math.min(Math.max(savedScale.value * e.scale, 0.35), 4.0);
      const scaleRatio = nextScale / savedScale.value;
      translateX.value = e.focalX - (e.focalX - savedX.value) * scaleRatio;
      translateY.value = e.focalY - (e.focalY - savedY.value) * scaleRatio;
      scale.value = nextScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  // [BUG-07 FIX]: O(1) Spatial Bucket Hit-Testing inside UI Worklet
  const tapGesture = Gesture.Tap().onEnd((e) => {
    const graphX = (e.x - translateX.value) / scale.value;
    const graphY = (e.y - translateY.value) / scale.value;
    const cellKey = `${Math.floor(graphX / CELL_SIZE)}:${Math.floor(graphY / CELL_SIZE)}`;
    const candidates = spatialBuckets.value[cellKey];
    if (!candidates) return;

    for (let i = 0; i < candidates.length; i++) {
      const node = candidates[i];
      const hitRadius = node.radius + 8;
      const dx = node.x - graphX;
      const dy = node.y - graphY;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        runOnJS(onSelectNode)(node);
        break;
      }
    }
  });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture, tapGesture);

  const transform = useDerivedValue(() => [
    { translateX: translateX.value },
    { translateY: translateY.value },
    { scale: scale.value },
  ]);

  if (!layout) {
    return (
      <View style={[styles.container, styles.centered, { width, height }]}>
        <ActivityIndicator color="#06B6D4" size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <GestureDetector gesture={composedGesture}>
        <Canvas style={{ width, height }}>
          <Group transform={transform}>
            {layout.simEdges.map((edge, idx) => (
              <Line
                key={`e-${idx}`}
                p1={vec(edge.x1, edge.y1)}
                p2={vec(edge.x2, edge.y2)}
                color="rgba(148, 163, 184, 0.28)"
                strokeWidth={1.5}
              />
            ))}
            {layout.simNodes.map((node) => {
              const color = DOMAIN_COLORS[node.domain] || '#3B82F6';
              return (
                <Group key={node.id}>
                  {node.severity === 'P0' && (
                    <Circle
                      cx={node.x}
                      cy={node.y}
                      r={node.radius + 6}
                      color="rgba(244, 63, 94, 0.25)"
                    />
                  )}
                  <Circle cx={node.x} cy={node.y} r={node.radius} color={color} />
                </Group>
              );
            })}
          </Group>
        </Canvas>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#07090E',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
