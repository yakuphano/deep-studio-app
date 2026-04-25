import { StyleSheet } from 'react-native';

export const videoWorkbenchStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  videoSection: {
    flex: 1,
    flexDirection: 'column',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  sidePanel: {
    width: 320,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  sidePanelContent: {
    flex: 1,
  },
  // Video controls
  controlsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  speedButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  speedButtonText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  timeDisplay: {
    fontSize: 14,
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  // Transcription section (video workbench: tek blok; flex:1 kartları şişirirdi)
  transcriptionSection: {
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  transcriptionContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transcriptionInput: {
    fontSize: 13,
    color: '#fff',
    textAlignVertical: 'top',
    minHeight: 72,
    maxHeight: 120,
    padding: 8,
  },
  transcriptionActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
  },
  actionButtonText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  // Annotation section
  annotationSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  annotationTools: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toolButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: 'rgba(148,163,184,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolButtonActive: {
    backgroundColor: '#3b82f6',
  },
  annotationCanvas: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  // Labels section
  labelsSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  labelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  labelOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  labelOptionSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  labelOptionText: {
    fontSize: 10,
    fontWeight: '500',
  },
  timeRangeInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  timeRangeLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  
  // Bottom buttons
  bottomButtonBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomLeftActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  bottomRightActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
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
    fontWeight: '600' 
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
    fontWeight: '600' 
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
    fontWeight: '600' 
  },
  submitButtonDisabled: { 
    opacity: 0.6 
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
    fontWeight: '600' 
  },

  taskInfoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    flexWrap: 'wrap',
    gap: 8,
  },
  taskInfoType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  taskInfoPriceBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  taskInfoPriceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  transcriptionScroll: {
    maxHeight: 100,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonDisabledText: {
    color: '#94a3b8',
  },
  transcriptionEditorSidebar: {
    flexGrow: 0,
    flexShrink: 0,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },

  /** video-annotation + VideoSidebar layout (önceden eksikti; sayfa çöküyordu) */
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  containerFullWidth: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    marginHorizontal: 0,
    paddingHorizontal: 0,
  },
  annotationLayout: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  leftToolbarCol: {
    width: 60,
    minWidth: 60,
    maxWidth: 60,
    padding: 4,
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    flexDirection: 'column',
    gap: 4,
  },
  toolBtnLarge: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 1,
  },
  toolBtnActivePurple: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  toolBtnLargeText: {
    fontSize: 9,
    color: '#f1f5f9',
    marginTop: 1,
    fontWeight: '500',
  },
  deleteToolBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#ef4444',
  },
  deleteToolBtnText: {
    color: '#ef4444',
  },
  annotationMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 300,
    flexDirection: 'column',
  },
  videoStage: {
    width: '100%',
    flexShrink: 0,
    minHeight: 280,
    backgroundColor: '#000',
  },
  videoMissingBox: {
    flex: 1,
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  videoMissingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    textAlign: 'center',
  },
  videoMissingHint: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 420,
  },
  optionalNotesBlock: {
    marginTop: 8,
    flexShrink: 0,
  },
  optionalNotesToggle: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  optionalNotesToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  annotationCanvasWrapFullWidth: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    alignSelf: 'stretch',
  },
  canvasWorkspace: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    minHeight: 200,
  },
  videoPlaceholderText: {
    color: '#64748b',
    fontSize: 16,
    marginTop: 8,
  },
  rightSidebar: {
    width: 280,
    minWidth: 280,
    maxWidth: 280,
    padding: 8,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    flexDirection: 'column',
    minHeight: 0,
    alignSelf: 'stretch',
  },
  rightSidebarTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  objectList: {
    flex: 1,
    minHeight: 60,
  },
  objectListEmpty: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  objectCardWrap: {
    marginBottom: 8,
  },
  objectCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#334155',
  },
  objectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  objectCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
  },
  labelOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  labelOptionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
});
