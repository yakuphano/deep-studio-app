import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LidarCuboidAnnotation } from '@/types/lidarAnnotation';
import {
  drawCuboidFootprintOnCtx,
  fitViewToFullImage,
  fitViewToImageRect,
  cuboidImagePixelBounds,
  type BevViewTransform,
} from '@/lib/lidar/bevWorldProjection';
import { useThemeColors } from '@/contexts/ThemeContext';
import type { LidarBevImageViewerProps } from './LidarBevImageViewer';

/** Keskin BEV referans — yalnızca pan/zoom; araçlar 3D görünümde kalır. */
export default function LidarBevImageViewer({
  imageUrl,
  worldWidth,
  worldDepth,
  cuboids,
  selectedId,
  hoveredId = null,
  fitViewRequestId = 0,
}: LidarBevImageViewerProps) {
  const theme = useThemeColors();
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const transformRef = useRef<BevViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastFitReq = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const paint = useCallback(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!host || !canvas || !img || !dims.w) return;

    const cssW = host.clientWidth;
    const cssH = host.clientHeight;
    if (cssW < 2 || cssH < 2) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, cssW, cssH);

    const tr = transformRef.current;
    ctx.save();
    ctx.translate(tr.offsetX, tr.offsetY);
    ctx.scale(tr.scale, tr.scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, dims.w, dims.h);

    for (const c of cuboids) {
      drawCuboidFootprintOnCtx(ctx, c, worldWidth, worldDepth, dims.w, dims.h, {
        selected: c.id === selectedId,
        hovered: c.id === hoveredId,
      });
    }
    ctx.restore();
  }, [cuboids, dims.h, dims.w, hoveredId, selectedId, worldDepth, worldWidth]);

  const applyFitView = useCallback(
    (focusSelected: boolean) => {
      const host = hostRef.current;
      if (!host || !dims.w) return;
      const cw = host.clientWidth;
      const ch = host.clientHeight;
      const selected =
        focusSelected && selectedId ? cuboids.find((x) => x.id === selectedId) : null;
      if (selected) {
        const b = cuboidImagePixelBounds(selected, worldWidth, worldDepth, dims.w, dims.h);
        transformRef.current = fitViewToImageRect(cw, ch, b.minPx, b.minPy, b.maxPx, b.maxPy);
      } else {
        transformRef.current = fitViewToFullImage(cw, ch, dims.w, dims.h);
      }
      paint();
    },
    [cuboids, dims.h, dims.w, paint, selectedId, worldDepth, worldWidth]
  );

  const refit = useCallback(() => applyFitView(false), [applyFitView]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
      setLoading(false);
    };
    img.onerror = () => {
      if (cancelled) return;
      setError(t('tasks.lidarBevLoadError'));
      setLoading(false);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl, t]);

  useEffect(() => {
    if (dims.w) refit();
  }, [dims, refit]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => refit());
    ro.observe(host);
    return () => ro.disconnect();
  }, [refit]);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    if (!fitViewRequestId || fitViewRequestId === lastFitReq.current) return;
    lastFitReq.current = fitViewRequestId;
    applyFitView(true);
  }, [fitViewRequestId, applyFitView]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t0 = transformRef.current;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextScale = Math.max(0.06, Math.min(80, t0.scale * factor));
    const ratio = nextScale / t0.scale;
    transformRef.current = {
      scale: nextScale,
      offsetX: mx - (mx - t0.offsetX) * ratio,
      offsetY: my - (my - t0.offsetY) * ratio,
    };
    paint();
  };

  const styles = useMemo(
    () => ({
      wrap: {
        position: 'relative' as const,
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        background: '#0f172a',
        overflow: 'hidden' as const,
        boxSizing: 'border-box' as const,
      },
      badge: {
        position: 'absolute' as const,
        top: 8,
        left: 8,
        zIndex: 2,
        fontSize: 11,
        fontWeight: 600,
        color: '#e2e8f0',
        background: 'rgba(15, 23, 42, 0.9)',
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid rgba(148, 163, 184, 0.35)',
        pointerEvents: 'none' as const,
      },
      canvas: {
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: 'grab' as const,
      },
      overlayMsg: {
        position: 'absolute' as const,
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.textMuted,
        fontSize: 13,
        zIndex: 1,
      },
    }),
    [theme.textMuted]
  );

  return (
    <div ref={hostRef} style={styles.wrap}>
      <span style={styles.badge}>
        {t('tasks.lidarBevTitle')}
        {dims.w > 0 ? ` · ${dims.w}×${dims.h}` : ''}
      </span>
      {loading ? <div style={styles.overlayMsg}>{t('tasks.lidarBevLoading')}</div> : null}
      {error ? <div style={styles.overlayMsg}>{error}</div> : null}
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onWheel={onWheel}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          panRef.current = {
            x: e.clientX,
            y: e.clientY,
            ox: transformRef.current.offsetX,
            oy: transformRef.current.offsetY,
          };
          if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        }}
        onPointerMove={(e) => {
          const pan = panRef.current;
          if (!pan) return;
          transformRef.current = {
            ...transformRef.current,
            offsetX: pan.ox + (e.clientX - pan.x),
            offsetY: pan.oy + (e.clientY - pan.y),
          };
          paint();
        }}
        onPointerUp={() => {
          panRef.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
        }}
        onPointerCancel={() => {
          panRef.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
        }}
        onDoubleClick={() => refit()}
      />
    </div>
  );
}
