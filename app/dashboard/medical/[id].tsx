import React from 'react';
import { AnnotationTaskNavProvider } from '@/contexts/AnnotationTaskNavContext';
import ImageTaskDetailScreen from '../image/[id]';

export default function MedicalTaskDetailScreen() {
  return (
    <AnnotationTaskNavProvider
      value={{
        listPath: '/dashboard/medical',
        detailBasePath: '/dashboard/medical',
        poolTypeFilter: 'medical',
      }}
    >
      <ImageTaskDetailScreen />
    </AnnotationTaskNavProvider>
  );
}
