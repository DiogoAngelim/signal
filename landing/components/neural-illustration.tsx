"use client";

import { useState, useRef, useCallback } from "react";

interface Node {
  id: number;
  cx: number;
  cy: number;
  baseCx: number;
  baseCy: number;
  r: number;
  delay: number;
  color: string;
}

interface Connection {
  id: number;
  fromId: number;
  toId: number;
  delay: number;
}

const CENTER_X = 250;
const CENTER_Y = 250;

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function buildNodes(): Node[] {
  const nodes: Node[] = [];
  const colors = [
    "rgba(223, 114, 71, 0.92)",
    "rgba(225, 220, 205, 0.82)",
    "rgba(85, 156, 205, 0.76)",
    "rgba(127, 86, 120, 0.64)",
    "rgba(39, 102, 166, 0.58)",
  ];

  nodes.push({
    id: 0,
    cx: CENTER_X,
    cy: CENTER_Y,
    baseCx: CENTER_X,
    baseCy: CENTER_Y,
    r: 8,
    delay: 0,
    color: colors[0],
  });

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const cx = round(CENTER_X + Math.cos(angle) * 60);
    const cy = round(CENTER_Y + Math.sin(angle) * 50);
    nodes.push({
      id: i + 1,
      cx,
      cy,
      baseCx: cx,
      baseCy: cy,
      r: 5,
      delay: round(i * 0.3),
      color: colors[1],
    });
  }

  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 10;
    const radius = 110 + (i % 3) * 4;
    const cx = round(CENTER_X + Math.cos(angle) * radius);
    const cy = round(CENTER_Y + Math.sin(angle) * (radius * 0.8));
    nodes.push({
      id: i + 7,
      cx,
      cy,
      baseCx: cx,
      baseCy: cy,
      r: 4,
      delay: round(i * 0.2),
      color: colors[2],
    });
  }

  const outerPoints = [
    [320, 120],
    [356, 148],
    [386, 192],
    [402, 245],
    [388, 304],
    [360, 352],
    [314, 385],
    [252, 398],
    [190, 386],
    [142, 358],
    [110, 312],
    [96, 256],
    [108, 198],
    [140, 146],
    [190, 112],
    [248, 100],
    [304, 110],
    [350, 134],
    [370, 180],
    [364, 236],
  ] as const;

  outerPoints.forEach(([cx, cy], index) => {
    nodes.push({
      id: index + 17,
      cx,
      cy,
      baseCx: cx,
      baseCy: cy,
      r: 2.5,
      delay: round(index * 0.15),
      color: colors[3 + (index % 2)],
    });
  });

  return nodes;
}

function buildConnections(): Connection[] {
  const connections: Connection[] = [];
  let connId = 0;

  for (let i = 1; i <= 6; i++) {
    connections.push({
      id: connId++,
      fromId: 0,
      toId: i,
      delay: round(i * 0.2),
    });
  }

  for (let i = 1; i <= 6; i++) {
    const targets = [7 + ((i - 1) * 2) % 10, 7 + ((i - 1) * 2 + 1) % 10];
    targets.forEach((target) => {
      if (target < 17) {
        connections.push({
          id: connId++,
          fromId: i,
          toId: target,
          delay: round(i * 0.15),
        });
      }
    });
  }

  for (let i = 7; i < 17; i++) {
    connections.push({
      id: connId++,
      fromId: i,
      toId: 17 + ((i - 7) * 2) % 20,
      delay: round((i - 7) * 0.1),
    });
  }

  return connections;
}

const INITIAL_NODES = buildNodes();
const INITIAL_CONNECTIONS = buildConnections();

export function NeuralIllustration() {
  const [nodes, setNodes] = useState<Node[]>(INITIAL_NODES);
  const [connections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [draggedNode, setDraggedNode] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const getSVGCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 500;
    const y = ((clientY - rect.top) / rect.height) * 500;
    return { x, y };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, nodeId: number) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggedNode(nodeId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggedNode === null) return;

    const { x, y } = getSVGCoordinates(e.clientX, e.clientY);

    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === draggedNode
          ? { ...node, cx: x, cy: y }
          : node
      )
    );
  }, [draggedNode, getSVGCoordinates]);

  const handlePointerUp = useCallback(() => {
    if (draggedNode === null) return;

    // Animate back to original position
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === draggedNode
          ? { ...node, cx: node.baseCx, cy: node.baseCy }
          : node
      )
    );
    setDraggedNode(null);
  }, [draggedNode]);

  const getNodeById = (id: number) => nodes.find(n => n.id === id);

  return (
    <div className="relative w-full max-w-lg aspect-square animate-float">
      {/* Outer glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(223,114,71,0.16)_0%,transparent_50%)] blur-2xl" />

      <svg
        ref={svgRef}
        viewBox="0 0 500 500"
        className="w-full h-full cursor-grab active:cursor-grabbing"
        xmlns="http://www.w3.org/2000/svg"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          {/* Core glow filter */}
          <filter id="coreGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Node glow filter */}
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradient for connections */}
          <linearGradient id="connectionGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(223, 114, 71, 0.62)" />
            <stop offset="50%" stopColor="rgba(39, 102, 166, 0.42)" />
            <stop offset="100%" stopColor="rgba(127, 86, 120, 0.24)" />
          </linearGradient>

          {/* Radial gradient for brain shape */}
          <radialGradient id="brainGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(223, 114, 71, 0.1)" />
            <stop offset="40%" stopColor="rgba(28, 57, 110, 0.05)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Subtle brain shape background */}
        <ellipse
          cx="250"
          cy="250"
          rx="180"
          ry="150"
          fill="url(#brainGrad)"
          className="animate-pulse-glow"
        />

        {/* Neural connections */}
        <g opacity="0.6">
          {connections.map((conn) => {
            const fromNode = getNodeById(conn.fromId);
            const toNode = getNodeById(conn.toId);
            if (!fromNode || !toNode) return null;
            return (
              <line
                key={conn.id}
                x1={fromNode.cx}
                y1={fromNode.cy}
                x2={toNode.cx}
                y2={toNode.cy}
                stroke="url(#connectionGrad)"
                strokeWidth="1"
                className={draggedNode === null ? "animate-neural" : ""}
                style={{
                  animationDelay: `${conn.delay}s`,
                  transition: draggedNode !== null ? "none" : "all 0.3s ease-out"
                }}
              />
            );
          })}
        </g>

        {/* Flowing energy paths */}
        <g opacity="0.3">
          <path
            d="M100,250 Q175,200 250,250 T400,250"
            fill="none"
            stroke="rgba(223, 114, 71, 0.48)"
            strokeWidth="2"
            className="animate-neural"
            style={{ animationDelay: "0s" }}
          />
          <path
            d="M150,150 Q250,180 300,250 Q350,320 250,350"
            fill="none"
            stroke="rgba(147, 48, 38, 0.4)"
            strokeWidth="1.5"
            className="animate-neural"
            style={{ animationDelay: "1s" }}
          />
          <path
            d="M350,150 Q280,200 250,250 Q220,300 150,350"
            fill="none"
            stroke="rgba(39, 102, 166, 0.42)"
            strokeWidth="1.5"
            className="animate-neural"
            style={{ animationDelay: "2s" }}
          />
        </g>

        {/* Neural nodes */}
        {nodes.map((node, index) => (
          <g
            key={node.id}
            style={{
              cursor: "grab",
              transition: draggedNode === node.id ? "none" : "all 0.3s ease-out"
            }}
          >
            {/* Extra glow for core */}
            {index === 0 && (
              <>
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={node.r * 2.5}
                  fill="rgba(223, 114, 71, 0.28)"
                  className="animate-pulse-glow"
                />
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={node.r * 4}
                  fill="rgba(39, 102, 166, 0.12)"
                  className="animate-pulse-glow"
                  style={{ animationDelay: "0.5s" }}
                />
              </>
            )}
            {/* Larger hit area for easier dragging */}
            <circle
              cx={node.cx}
              cy={node.cy}
              r={Math.max(node.r * 3, 15)}
              fill="transparent"
              onPointerDown={(e) => handlePointerDown(e, node.id)}
              style={{ touchAction: "none" }}
            />
            <circle
              cx={node.cx}
              cy={node.cy}
              r={draggedNode === node.id ? node.r * 1.5 : node.r}
              fill={node.color}
              filter={index === 0 ? "url(#coreGlow)" : "url(#nodeGlow)"}
              className={draggedNode === node.id ? "" : "animate-twinkle"}
              style={{
                animationDelay: `${node.delay}s`,
                pointerEvents: "none",
                transition: "r 0.15s ease-out"
              }}
            />
          </g>
        ))}

        {/* Radiating energy lines from center */}
        <g opacity="0.4">
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
            const coreNode = getNodeById(0);
            const cx = coreNode?.cx ?? CENTER_X;
            const cy = coreNode?.cy ?? CENTER_Y;
            return (
              <line
                key={angle}
                x1={cx}
                y1={cy}
                x2={cx + Math.cos((angle * Math.PI) / 180) * 220}
                y2={cy + Math.sin((angle * Math.PI) / 180) * 180}
                stroke="rgba(85, 156, 205, 0.16)"
                strokeWidth="0.5"
                strokeDasharray="4 8"
                className={draggedNode === null ? "animate-neural" : ""}
                style={{ animationDelay: `${angle / 100}s` }}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
