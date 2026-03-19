import { useEffect, useRef, useState } from 'react';

const DURATION = 500;
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

export function useCountUp(target: number, enabled = true): number {
  const [displayed, setDisplayed] = useState(target);
  const prevTarget = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(target);
      prevTarget.current = target;
      return;
    }
    if (target === prevTarget.current) return;

    const start = prevTarget.current;
    prevTarget.current = target;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = easeOutQuad(progress);
      const value = start + (target - start) * eased;
      setDisplayed(value);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, enabled]);

  return displayed;
}
