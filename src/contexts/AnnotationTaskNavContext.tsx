import React, { createContext, useContext, useMemo } from 'react';

export type AnnotationTaskNavConfig = {
  listPath: string;
  detailBasePath: string;
  /** Restrict "next pool task" claim to this `tasks.type` when set */
  poolTypeFilter: string | null;
};

const defaultConfig: AnnotationTaskNavConfig = {
  listPath: '/dashboard/image',
  detailBasePath: '/dashboard/image',
  poolTypeFilter: null,
};

const AnnotationTaskNavContext = createContext<AnnotationTaskNavConfig>(defaultConfig);

export function AnnotationTaskNavProvider({
  value,
  children,
}: {
  value: AnnotationTaskNavConfig;
  children: React.ReactNode;
}) {
  const memo = useMemo(() => value, [value.listPath, value.detailBasePath, value.poolTypeFilter]);
  return (
    <AnnotationTaskNavContext.Provider value={memo}>{children}</AnnotationTaskNavContext.Provider>
  );
}

export function useAnnotationTaskNav() {
  return useContext(AnnotationTaskNavContext);
}
