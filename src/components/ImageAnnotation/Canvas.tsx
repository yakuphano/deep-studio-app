import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LABEL_COLORS } from '@/constants/annotationLabels';

interface CanvasProps {
  imageUrl: string;
  annotations: any[];
  onAnnotationsChange: (annotations: any[]) => void;
  activeTool: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  selectedLabel: string;
}

export default function Canvas({ imageUrl, annotations, onAnnotationsChange, activeTool, selectedId, onSelect, selectedLabel }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);

  const screenToImage = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === 'bbox') {
      const pos = screenToImage(e.clientX, e.clientY);
      drawingStartRef.current = pos;
      setIsDrawing(true);
      const newId = `bbox-${Date.now()}`;
      onAnnotationsChange([...annotations, { id: newId, type: 'bbox', ...pos, width: 0, height: 0, label: selectedLabel || 'diğer' }]);
      onSelect(newId);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDrawing && drawingStartRef.current && selectedId) {
      const currentPos = screenToImage(e.clientX, e.clientY);
      const start = drawingStartRef.current;
      onAnnotationsChange(annotations.map(ann => 
        ann.id === selectedId ? {
          ...ann,
          x: Math.min(start.x, currentPos.x),
          y: Math.min(start.y, currentPos.y),
          width: Math.abs(currentPos.x - start.x),
          height: Math.abs(currentPos.y - start.y)
        } : ann
      ));
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    drawingStartRef.current = null;
  };

  return (
    <View style={styles.container}>
      <div 
        ref={containerRef}
        onPointerDown={handlePointerDown} 
        onPointerMove={handlePointerMove} 
        onPointerUp={handlePointerUp}
        style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', backgroundColor: '#000', cursor: activeTool === 'bbox' ? 'crosshair' : 'default' }}
      >
        <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0' }}>
          <img src={imageUrl} draggable={false} style={{ display: 'block' }} />
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {annotations.map(ann => {
              const color = LABEL_COLORS[ann.label] || '#94a3b8';
              const isSel = ann.id === selectedId;
              return (
                <g key={ann.id}>
                  <rect x={ann.x} y={ann.y} width={ann.width} height={ann.height} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={2 / scale} />
                  {isSel && (
                    <rect x={ann.x} y={ann.y} width={ann.width} height={ann.height} fill="transparent" stroke="#fff" strokeWidth={1/scale} strokeDasharray="5,5" />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
