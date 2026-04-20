import { StyleSheet } from 'react-native';

// Workbench and Video Annotation Styles
// Extracted from video-annotation.tsx to reduce file size

export const workbenchStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  containerFullWidth: {
    width: '100%',
    maxWidth: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  loadingText: {
    color: '#f1f5f9',
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
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  topBarTitle: {
    color: '#f1f5f9',
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
    backgroundColor: '#1e293b',
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  centerColumnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  centerColumnTitle: {
    color: '#f1f5f9',
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
    color: '#64748b',
    fontSize: 16,
    marginTop: 8,
  },
  videoUrlText: {
    color: '#475569',
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
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  timeText: {
    color: '#fff',
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
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  speedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'center',
  },
  // Seek Bar
  seekBar: {
    height: 4,
    backgroundColor: '#334155',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  seekBarProgress: {
    height: '100%',
    backgroundColor: '#334155',
    position: 'relative',
  },
  seekBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
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
    backgroundColor: '#3b82f6',
  },
  // Control Bar
  videoControlBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  etiketleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
  },
  etiketleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Right Sidebar
  videoRightSidebar: {
    flex: 3,
    backgroundColor: '#1e293b',
    padding: 16,
  },
  rightSidebarTitle: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  objectList: {
    flex: 1,
  },
  objectListEmpty: {
    color: '#64748b',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 32,
  },
  objectCardWrap: {
    marginBottom: 8,
  },
  objectCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
  },
  objectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  objectCardTitle: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  objectCardTimestamp: {
    color: '#64748b',
    fontSize: 12,
  },
  // Footer
  footer: {
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  bottomButtonBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  exitButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  exitButtonText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  submitExitButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  submitExitButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  submitButtonGreen: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submitButtonGreenText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submittedBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submittedText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    minWidth: 300,
    maxWidth: '80%',
  },
  modalTitle: {
    color: '#f1f5f9',
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
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalLabelOptionSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  modalLabelText: {
    color: '#f1f5f9',
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
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '500',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
  },
  modalConfirmButtonDisabled: {
    backgroundColor: '#334155',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
