import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import GuidelineSideDrawer from '@/components/task/GuidelineSideDrawer';

type GuidelinePayload = {
  url: string;
  fileName: string | null;
};

type GuidelineDrawerContextValue = {
  openGuideline: (url: string, fileName?: string | null) => void;
  closeGuideline: () => void;
  isOpen: boolean;
};

const GuidelineDrawerContext = createContext<GuidelineDrawerContextValue | null>(null);

export function GuidelineDrawerProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = useState<GuidelinePayload | null>(null);

  const openGuideline = useCallback((url?: string | null, fileName?: string | null) => {
    setPayload({
      url: String(url ?? '').trim(),
      fileName: fileName?.trim() || null,
    });
  }, []);

  const closeGuideline = useCallback(() => setPayload(null), []);

  const value = useMemo(
    () => ({
      openGuideline,
      closeGuideline,
      isOpen: payload != null,
    }),
    [openGuideline, closeGuideline, payload]
  );

  return (
    <GuidelineDrawerContext.Provider value={value}>
      {children}
      <GuidelineSideDrawer
        visible={payload != null}
        url={payload?.url ?? ''}
        fileName={payload?.fileName ?? null}
        onClose={closeGuideline}
      />
    </GuidelineDrawerContext.Provider>
  );
}

export function useGuidelineDrawer(): GuidelineDrawerContextValue {
  const ctx = useContext(GuidelineDrawerContext);
  if (!ctx) {
    throw new Error('useGuidelineDrawer must be used within GuidelineDrawerProvider');
  }
  return ctx;
}

/** Provider yoksa sessizce no-op (test / izole bileşenler). */
export function useGuidelineDrawerOptional(): GuidelineDrawerContextValue | null {
  return useContext(GuidelineDrawerContext);
}
