import { useCadStore } from '../app/cadStore';

export function StatusBar() {
  const { selection, selectedBodyId, position, snapEnabled, transformMode, transformSpace } = useCadStore();

  const selLabel = selection
    ? `${selection.type.toUpperCase()}  ·  ${selectedBodyId}`
    : 'Ready — click a body to select';

  return (
    <div style={{
      height: 26, background: '#0f1318',
      borderTop: '1px solid #1a2030',
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 20,
      fontSize: 11, color: '#4a6080',
      userSelect: 'none',
    }}>
      <span style={{ color: selection ? '#90c4f8' : '#4a6080' }}>{selLabel}</span>
      <span>·</span>
      <span>X: {position[0].toFixed(3)}  Y: {position[1].toFixed(3)}  Z: {position[2].toFixed(3)} mm</span>
      <span>·</span>
      <span style={{ color: '#3d6080' }}>
        {transformMode === 'translate' ? 'MOVE' : 'ROTATE'} · {transformSpace.toUpperCase()} · Snap: {snapEnabled ? 'ON' : 'OFF'}
      </span>
      <div style={{ flex: 1 }} />
      <span style={{ color: '#2d4060' }}>Sprint 1.x · Online-CAD MVP</span>
    </div>
  );
}
