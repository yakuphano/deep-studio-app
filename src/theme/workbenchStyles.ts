import { StyleSheet } from 'react-native';
import { colors } from './colors';

// Workbench and Video Annotation Styles
// Extracted from video-annotation.tsx to reduce file size

export const workbenchStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  containerFullWidth: {
    width: '100%',
    maxWidth: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.text,
    marginTop: 16,
    fontSize: 16,
  },
  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  topBarTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  // Video Layout
  videoLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  videoCenterColumn: {
    flex: 7,
    backgroundColor: colors.surfaceElevated,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  centerColumnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  centerColumnTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Video Player
  videoPlayerContainer: {
    flex: 1,
    backgroundColor: '#000',
    margin: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  videoPlaceholderText: {
    color: colors.textMuted,
    fontSize: 16,
    marginTop: 8,
  },
  videoUrlText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  // Video Controls
  videoControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  timeText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '500',
  },
  speedControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speedButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  speedText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'center',
  },
  // Seek Bar
  seekBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  seekBarProgress: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
  },
  seekBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  seekBarThumb: {
    position: 'absolute',
    top: -6,
    left: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  // Control Bar
  videoControlBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  etiketleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  etiketleButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
  // Right Sidebar
  videoRightSidebar: {
    flex: 3,
    backgroundColor: colors.surface,
    padding: 16,
  },
  rightSidebarTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  objectList: {
    flex: 1,
  },
  objectListEmpty: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 32,
  },
  objectCardWrap: {
    marginBottom: 8,
  },
  objectCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  objectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  objectCardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  objectCardTimestamp: {
    color: colors.textMuted,
    fontSize: 12,
  },
  // Footer
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomButtonBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  exitButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.error,
  },
  exitButtonText: {
    fontSize: 14,
    color: colors.error,
    fontWeight: '500',
  },
  submitExitButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  submitExitButtonText: {
    fontSize: 14,
    color: colors.onAccent,
    fontWeight: '500',
  },
  submitButtonGreen: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.success,
  },
  submitButtonGreenText: {
    fontSize: 14,
    color: colors.onAccent,
    fontWeight: '500',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submittedBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.success,
  },
  submittedText: {
    fontSize: 14,
    color: colors.onAccent,
    fontWeight: '500',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    minWidth: 300,
    maxWidth: '80%',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalLabelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  modalLabelOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalLabelOptionSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
    borderWidth: 2,
  },
  modalLabelText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  modalConfirmButtonDisabled: {
    backgroundColor: colors.border,
  },
  modalConfirmText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
});
