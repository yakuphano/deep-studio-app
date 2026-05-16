import React from 'react';
import GuidelineOpenButton from '@/components/task/GuidelineOpenButton';

type Props = {
  guidelineUrl?: string | null;
  guidelineFileName?: string | null;
  compact?: boolean;
};

/** Görev detayında kılavuz butonu (her zaman görünür). */
export default function TaskGuidelinePanel({
  guidelineUrl,
  guidelineFileName,
  compact,
}: Props) {
  return (
    <GuidelineOpenButton
      variant="header"
      guidelineUrl={guidelineUrl}
      guidelineFileName={guidelineFileName}
      style={compact ? { marginBottom: 8 } : { marginBottom: 12 }}
    />
  );
}
