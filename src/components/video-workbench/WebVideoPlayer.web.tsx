import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { proColors } from '@/theme/videoProWorkbenchTheme';

export type WebVideoPlayerHandle = {
  togglePlayPause: () => void;
  pause: () => void;
  seekToTime: (t: number) => void;
  stepFrames: (delta: number) => void;
  captureFrame: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoSize: () => { w: number; h: number };
  setPlaybackRate: (r: number) => void;
};

type Props = {
  src: string;
  fps?: number;
  onFrameCapture: (frameData: string, frameNumber: number, timestamp: number) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onLoadedMetadata: (duration: number) => void;
  onVideoDimensions?: (w: number, h: number) => void;
};

function safeDuration(video: HTMLVideoElement, fallback: number): number {
  const a = video.duration;
  const b = fallback;
  const d = Number.isFinite(a) && a > 0 ? a : Number.isFinite(b) && b > 0 ? b : 0;
  return d;
}

/** Duraklatmada drawImage için videoWidth/Height bazen henüz 0; layout / decode sonrası doluyor. */
async function waitForVideoDimensions(video: HTMLVideoElement, timeoutMs = 1400): Promise<boolean> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return true;
  const t0 = performance.now();
  return new Promise((resolve) => {
    let raf = 0;
    const done = (ok: boolean) => {
      cancelAnimationFrame(raf);
      video.removeEventListener('loadeddata', onMedia);
      video.removeEventListener('canplay', onMedia);
      video.removeEventListener('loadedmetadata', onMedia);
      video.removeEventListener('seeked', onMedia);
      resolve(ok);
    };
    const onMedia = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) done(true);
    };
    video.addEventListener('loadeddata', onMedia);
    video.addEventListener('canplay', onMedia);
    video.addEventListener('loadedmetadata', onMedia);
    video.addEventListener('seeked', onMedia);
    const tick = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        done(true);
        return;
      }
      if (performance.now() - t0 >= timeoutMs) {
        done(video.videoWidth > 0 && video.videoHeight > 0);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}

function isVideoLikeCaptureUrl(capSrc: string): boolean {
  return (
    /\.(mp4|m4v|webm|ogg|mov)(\?|#|$)/i.test(capSrc) ||
    /\/storage\/v1\/object\//i.test(capSrc) ||
    /[?&]stream=1(?:&|$)/i.test(capSrc) ||
    /\/_supabase-fn\/task-media/i.test(capSrc) ||
    /\/functions\/v1\/task-media/i.test(capSrc)
  );
}

/**
 * `crossOrigin="anonymous"` kullanmayacağımız kaynaklar (CORS yoksa Chrome code 4).
 * Supabase Storage (public + sign) genelde `Access-Control-Allow-Origin` verir; crossOrigin
 * olmadan public URL’lerde tuval kirlenir ve kare (sol panel) boş kalır.
 */
function skipCrossOriginForSrc(src: string): boolean {
  if (!src || src.startsWith('blob:')) return true;
  if (typeof window !== 'undefined') {
    try {
      const a = new URL(src, window.location.href);
      if (
        a.origin === window.location.origin &&
        (a.pathname.includes('/_supabase-fn/') || a.pathname.includes('task-media'))
      ) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  const u = src.toLowerCase();
  if (/\.cloudfront\.net\//i.test(u)) return true;
  if (/x-amz-credential=/i.test(u)) return true;
  return false;
}

export const WebVideoPlayer = forwardRef<WebVideoPlayerHandle, Props>(function WebVideoPlayer(
  { src, fps = 30, onFrameCapture, onTimeUpdate, onLoadedMetadata, onVideoDimensions },
  ref
) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  /** CORS: önce anonymous; yükleme hata verirse (çoğu “failed”) crossOrigin kaldırılıp tekrar denenir. */
  const [corsRelaxed, setCorsRelaxed] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  /** Aynı seek sırasında pause + loadeddata + seeked ile üst üste binen yakalamaları tek sonuca indir */
  const captureRafRef = useRef(0);
  const captureGenRef = useRef(0);
  const captureFrameRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    setCorsRelaxed(false);
    setMediaError(null);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setMediaError(null);
    const omitCors =
      src.startsWith('blob:') || skipCrossOriginForSrc(src) || corsRelaxed;
    if (omitCors) {
      video.removeAttribute('crossorigin');
    } else {
      video.crossOrigin = 'anonymous';
    }
    video.src = src;
    video.load();
  }, [src, corsRelaxed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate(video.currentTime, video.duration || duration);
    };

    const handleLoadedMetadata = () => {
      const d = video.duration;
      setDuration(d);
      onLoadedMetadata(d);
      onVideoDimensions?.(video.videoWidth, video.videoHeight);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    const handleVideoError = () => {
      const err = video.error;
      const code = err?.code;
      const msg = err?.message || '';
      if (
        !src.startsWith('blob:') &&
        !corsRelaxed &&
        !skipCrossOriginForSrc(src)
      ) {
        setCorsRelaxed(true);
        return;
      }
      const short =
        code === 4
          ? 'Biçim/URL/CORS — H.264+AAC .mp4 deneyin.'
          : 'Ağ veya depo erişimi.';
      const detail = [msg?.trim(), short].filter(Boolean).join(' ');
      if (process.env.NODE_ENV === 'development' && msg) {
        console.warn('[WebVideoPlayer] video error', { code, msg });
      }
      setMediaError(detail.length > 160 ? `${detail.slice(0, 157)}…` : detail);
    };

    video.addEventListener('error', handleVideoError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleVideoError);
    };
  }, [onTimeUpdate, onLoadedMetadata, onVideoDimensions, duration, src, corsRelaxed]);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const d = safeDuration(video, duration);
    if (!Number.isFinite(time)) return;
    video.currentTime = Math.max(0, Math.min(d, time));
  }, [duration]);

  const stepFrames = useCallback(
    (frames: number) => {
      const video = videoRef.current;
      if (!video) return;
      const d = safeDuration(video, duration);
      const ft = 1 / fps;
      const next = (video.currentTime || 0) + frames * ft;
      video.currentTime = Math.max(0, Math.min(d || 0, next));
    },
    [duration, fps]
  );

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
  }, []);

  const captureFrame = useCallback(async () => {
    let video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!video.videoWidth || !video.videoHeight) {
      await waitForVideoDimensions(video);
      video = videoRef.current;
      if (!video || !canvas) return;
    }
    if (!video.videoWidth || !video.videoHeight) return;
    const myGen = ++captureGenRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    let frameData: string | null = null;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frameData = canvas.toDataURL('image/png');
    } catch {
      frameData = null;
    }

    // Tam MP4 fetch → tarayıcıda net::ERR_FAILED / bellek; yalnızca küçük görüntü URL’lerinde dene.
    if (!frameData || frameData.length < 32) {
      const capSrc = video.currentSrc || video.src;
      const looksLikeVideoFile = isVideoLikeCaptureUrl(capSrc);
      if (capSrc && !capSrc.startsWith('blob:') && !looksLikeVideoFile) {
        try {
          const r = await fetch(capSrc, { mode: 'cors', credentials: 'omit' });
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          const img = document.createElement('img');
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('img'));
            img.src = url;
          });
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          frameData = canvas.toDataURL('image/png');
        } catch {
          console.warn('[WebVideoPlayer] Kare alınamadı (CORS veya ağ). Videoyu duraklatıp tekrar deneyin.');
          return;
        }
      } else if (looksLikeVideoFile) {
        console.warn(
          '[WebVideoPlayer] Kare alınamadı: video CORS ile yüklenemiyor olabilir (crossOrigin). Depo CORS ayarını kontrol edin veya imzalı URL deneyin.'
        );
        return;
      } else {
        return;
      }
    }

    if (myGen !== captureGenRef.current) return;

    const frameNumber = Math.floor((video.currentTime || 0) * fps);
    onFrameCapture(frameData, frameNumber, video.currentTime || 0);
  }, [fps, onFrameCapture]);

  captureFrameRef.current = captureFrame;

  /** Kamera butonu kaldırıldı; anotasyon karesi seek / duraklat / yüklemede senkronlanır */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const scheduleSnap = (reason: 'seeked' | 'pause' | 'loadeddata') => {
      // Sadece loadeddata için seeking sırasında atla; pause'ta atlama (kare hiç gelmiyordu).
      if (reason === 'loadeddata' && video.seeking) return;
      cancelAnimationFrame(captureRafRef.current);
      captureRafRef.current = requestAnimationFrame(() => {
        captureRafRef.current = 0;
        const v = videoRef.current;
        if (!v) return;
        if (v.seeking && reason !== 'seeked') {
          const onSeekedOnce = () => {
            v.removeEventListener('seeked', onSeekedOnce);
            void captureFrame();
          };
          v.addEventListener('seeked', onSeekedOnce, { once: true });
          return;
        }
        void captureFrame();
      });
    };
    const onSeeked = () => scheduleSnap('seeked');
    const onPause = () => {
      scheduleSnap('pause');
      // İlk pause’ta intrinsic boyut / decode gecikmesi: kısa gecikmeyle tekrar kare al (pencere bölünce çalışıyordu).
      [60, 200, 450].forEach((ms) => {
        window.setTimeout(() => {
          const el = videoRef.current;
          if (el?.paused) void captureFrameRef.current?.();
        }, ms);
      });
    };
    const onLoadedData = () => scheduleSnap('loadeddata');
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadeddata', onLoadedData);
    return () => {
      cancelAnimationFrame(captureRafRef.current);
      captureRafRef.current = 0;
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadeddata', onLoadedData);
    };
  }, [src, captureFrame]);

  const changeSpeed = useCallback((speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      togglePlayPause,
      pause,
      seekToTime: seekTo,
      stepFrames,
      captureFrame,
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? duration,
      getVideoSize: () => ({
        w: videoRef.current?.videoWidth ?? 0,
        h: videoRef.current?.videoHeight ?? 0,
      }),
      setPlaybackRate: changeSpeed,
    }),
    [togglePlayPause, pause, seekTo, stepFrames, captureFrame, duration, changeSpeed]
  );

  const formatTime = (time: number) => {
    const h = Math.floor(time / 3600);
    const m = Math.floor((time % 3600) / 60);
    const s = Math.floor(time % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return React.createElement(
    'div',
    {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        flex: 1,
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${proColors.border}`,
        borderRadius: proColors.radius,
      } as React.CSSProperties,
    },
    [
      React.createElement('video', {
        key: `video-${src}`,
        ref: (el: HTMLVideoElement | null) => {
          videoRef.current = el;
        },
        playsInline: true,
        preload: 'auto',
        style: {
          width: '100%',
          flex: 1,
          minHeight: 0,
          objectFit: 'contain' as const,
          backgroundColor: '#000',
          outline: 'none',
        } as React.CSSProperties,
      }),
      mediaError
        ? React.createElement(
            'div',
            {
              key: 'err',
              style: {
                position: 'absolute',
                left: 8,
                right: 8,
                top: 8,
                maxWidth: 'min(100%, 420px)',
                marginLeft: 'auto',
                marginRight: 'auto',
                padding: '6px 8px',
                borderRadius: 6,
                backgroundColor: 'rgba(127, 29, 29, 0.92)',
                border: '1px solid #fca5a5',
                zIndex: 6,
              } as React.CSSProperties,
            },
            React.createElement(
              'span',
              {
                title: mediaError.length > 80 ? mediaError : undefined,
                style: {
                  color: '#fecaca',
                  fontSize: 11,
                  lineHeight: 1.35,
                  display: 'block',
                  maxHeight: '2.75em',
                  overflow: 'hidden',
                  overflowWrap: 'anywhere' as const,
                  wordBreak: 'break-word' as const,
                } as React.CSSProperties,
              },
              `Video yüklenemedi: ${mediaError}`
            )
          )
        : null,
      React.createElement('canvas', {
        key: 'canvas',
        ref: (el: HTMLCanvasElement | null) => {
          canvasRef.current = el;
        },
        style: { display: 'none' } as React.CSSProperties,
      }),
      React.createElement(
        'div',
        {
          key: 'controls',
          style: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 2,
            zIndex: 4,
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            padding: '10px 12px 12px',
            borderTop: `1px solid ${proColors.border}`,
            borderRadius: '0 0 6px 6px',
            boxSizing: 'border-box',
          } as React.CSSProperties,
        },
        [
          React.createElement('input', {
            key: 'seek',
            type: 'range',
            min: 0,
            max: duration || 0.001,
            step: 0.001,
            value: Math.min(currentTime, duration || 0),
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              seekTo(parseFloat(e.target.value)),
            onInput: (e: React.FormEvent<HTMLInputElement>) =>
              seekTo(parseFloat((e.target as HTMLInputElement).value)),
            style: { width: '100%', cursor: 'pointer' } as React.CSSProperties,
          }),
          React.createElement(
            'div',
            {
              key: 'row',
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
                gap: 8,
              } as React.CSSProperties,
            },
            [
              React.createElement(
                'div',
                {
                  key: 'l',
                  style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 } as React.CSSProperties,
                },
                [
                  React.createElement(
                    'button',
                    {
                      key: 'start',
                      type: 'button',
                      title: `${t('taskDetail.videoStart')} (Space)`,
                      'aria-label': `${t('taskDetail.videoStart')} (Space)`,
                      disabled: isPlaying,
                      onClick: () => {
                        const video = videoRef.current;
                        if (!video || !video.paused) return;
                        void video.play().catch(() => {});
                      },
                      style: labeledBtnStyle('start', isPlaying),
                    },
                    React.createElement(Ionicons, {
                      name: 'play',
                      size: 22,
                      color: isPlaying ? proColors.textMuted : '#ffffff',
                      style: { pointerEvents: 'none' } as const,
                    })
                  ),
                  React.createElement(
                    'button',
                    {
                      key: 'stop',
                      type: 'button',
                      title: `${t('taskDetail.videoStop')} (Space)`,
                      'aria-label': `${t('taskDetail.videoStop')} (Space)`,
                      disabled: !isPlaying,
                      onClick: () => {
                        const video = videoRef.current;
                        if (!video || video.paused) return;
                        video.pause();
                      },
                      style: labeledBtnStyle('stop', !isPlaying),
                    },
                    React.createElement(Ionicons, {
                      name: 'pause',
                      size: 22,
                      color: !isPlaying ? proColors.textMuted : '#ffffff',
                      style: { pointerEvents: 'none' } as const,
                    })
                  ),
                  React.createElement(
                    'button',
                    {
                      key: 'pf',
                      type: 'button',
                      title: `${t('taskDetail.videoPrevFrame')} (A)`,
                      'aria-label': `${t('taskDetail.videoPrevFrame')} (A)`,
                      onClick: () => stepFrames(-1),
                      style: secondaryBtnStyle(),
                    },
                    React.createElement(Ionicons, {
                      name: 'chevron-back',
                      size: 22,
                      color: proColors.text,
                      style: { pointerEvents: 'none' } as const,
                    })
                  ),
                  React.createElement(
                    'button',
                    {
                      key: 'nf',
                      type: 'button',
                      title: `${t('taskDetail.videoNextFrame')} (D)`,
                      'aria-label': `${t('taskDetail.videoNextFrame')} (D)`,
                      onClick: () => stepFrames(1),
                      style: secondaryBtnStyle(),
                    },
                    React.createElement(Ionicons, {
                      name: 'chevron-forward',
                      size: 22,
                      color: proColors.text,
                      style: { pointerEvents: 'none' } as const,
                    })
                  ),
                ]
              ),
              React.createElement(
                'span',
                { key: 't', style: { fontSize: 11, color: proColors.textMuted, fontFamily: 'monospace' } as React.CSSProperties },
                `${formatTime(currentTime)} / ${formatTime(duration)}`
              ),
              React.createElement(
                'div',
                { key: 'r', style: { display: 'flex', gap: 6, alignItems: 'center' } as React.CSSProperties },
                [
                  React.createElement(
                    'select',
                    {
                      key: 'sp',
                      value: playbackSpeed,
                      title: t('taskDetail.playbackSpeed'),
                      onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                        changeSpeed(parseFloat(e.target.value)),
                      style: {
                        padding: '4px 8px',
                        borderRadius: proColors.radius,
                        backgroundColor: proColors.bg,
                        border: `1px solid ${proColors.border}`,
                        color: proColors.text,
                        fontSize: 11,
                        cursor: 'pointer',
                      } as React.CSSProperties,
                    },
                    [
                      React.createElement('option', { key: '0.25', value: 0.25 }, '0.25x'),
                      React.createElement('option', { key: '0.5', value: 0.5 }, '0.5x'),
                      React.createElement('option', { key: '1', value: 1 }, '1x'),
                      React.createElement('option', { key: '1.5', value: 1.5 }, '1.5x'),
                      React.createElement('option', { key: '2', value: 2 }, '2x'),
                    ]
                  ),
                ]
              ),
            ]
          ),
        ]
      ),
    ]
  );
});

function labeledBtnStyle(kind: 'start' | 'stop', disabled: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 44,
    height: 44,
    padding: 0,
    borderRadius: proColors.radius,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    border: '1px solid transparent',
  };
  if (kind === 'start') {
    return {
      ...base,
      backgroundColor: disabled ? '#1e3a2f' : '#15803d',
      color: '#fff',
      borderColor: disabled ? '#334155' : '#22c55e',
    };
  }
  return {
    ...base,
    backgroundColor: disabled ? '#334155' : '#7f1d1d',
    color: '#fecaca',
    borderColor: disabled ? '#475569' : '#ef4444',
  };
}

function secondaryBtnStyle(): React.CSSProperties {
  return {
    width: 44,
    height: 44,
    padding: 0,
    borderRadius: proColors.radius,
    backgroundColor: '#334155',
    border: '1px solid #475569',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };
}

