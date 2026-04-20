import React from 'react';
import { View, StyleSheet } from 'react-native';

interface CanvasToolbarProps {
  activeTool: string;
  brushColor: string;
  isPaletteOpen: boolean;
  onToolChange: (tool: string) => void;
  onBrushColorChange: (color: string) => void;
  onPaletteToggle: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  activeTool,
  brushColor,
  isPaletteOpen,
  onToolChange,
  onBrushColorChange,
  onPaletteToggle,
}) => {
  return (
    <View style={styles.toolbarContainer}>
      {/* Reset/Center Butonu */}
      <button
        onClick={() => {
          // Reset view functionality would be handled by parent
          console.log('[CanvasToolbar] Reset view clicked');
        }}
        style={styles.resetButton}
        title="Görünümü Sıfırla - Nesneler"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 4v6h6M23 20v-6h-6"/>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
        </svg>
      </button>
      
      {/* Toolbar Butonu ve Palet Kapsayıcısı */}
      <View style={styles.toolbarButtonContainer}>
        {/* Toolbar Butonu */}
        <button
          onClick={() => {
            if (activeTool !== 'brush') {
              onToolChange('brush');
            }
            onPaletteToggle();
          }}
          style={{
            ...styles.toolbarButton,
            backgroundColor: brushColor,
            border: activeTool === 'brush' ? '3px solid #2563eb' : '2px solid white',
          }}
          title="Fırça aracı - Renk seçimi"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </button>
        
        {/* Hamburger Menü - Sadece Brush Aktifken */}
        {activeTool === 'brush' && isPaletteOpen && (
          <View style={styles.colorPalette}>
            {[
              { color: '#ff0000', name: 'Kırmızı' },
              { color: '#00ff00', name: 'Yeşil' },
              { color: '#0000ff', name: 'Mavi' },
              { color: '#ffff00', name: 'Sarı' },
              { color: '#ffa500', name: 'Turuncu' },
              { color: '#ff00ff', name: 'Mor' },
              { color: '#ffc0cb', name: 'Pembe' },
              { color: '#00ffff', name: 'Turkuaz' },
              { color: '#8b4513', name: 'Kahverengi' },
              { color: '#000000', name: 'Siyah' },
              { color: '#ffffff', name: 'Beyaz' },
              { color: '#808080', name: 'Gri' },
            ].map((item) => (
              <button
                key={item.color}
                onClick={() => {
                  onBrushColorChange(item.color);
                  onPaletteToggle();
                }}
                style={{
                  ...styles.colorButton,
                  backgroundColor: item.color,
                  border: brushColor === item.color ? '3px solid #2563eb' : '2px solid #e5e7eb',
                }}
                title={item.name}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  toolbarContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 1001,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  resetButton: {
    width: 32,
    height: 32,
    backgroundColor: '#2563eb',
    border: '2px solid white',
    borderRadius: 6,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  toolbarButtonContainer: {
    position: 'relative',
  },
  toolbarButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  colorPalette: {
    position: 'absolute',
    top: 37,
    left: 0,
    backgroundColor: 'white',
    padding: 8,
    zIndex: 10000,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
    minWidth: 180,
  },
  colorButton: {
    width: 28,
    height: 28,
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
});
