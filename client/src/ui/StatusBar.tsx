import { useCadStore } from '../app/cadStore';

export function StatusBar() {
  const { selection, selectedBodyId, position, snapEnabled, transformMode, transformSpace } = useCadStore();

  const selLabel = selection
    ? `${selection.type.toUpperCase()}  ·  ${selectedBodyId}`
    : 'Ready — click a body to select';

  return (
    <div style={{
      height: 26, background: 'var(--bg1)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 16,
      fontSize: 11, color: 'var(--text3)',
      userSelect: 'none',
    }}>
      <span style={{ color: selection ? 'var(--accent)' : 'var(--text3)' }}>{selLabel}</span>
      <span>·</span>
      <span style={{ fontFamily: 'monospace', fontSize: 10 }}>
        X: {position[0].toFixed(3)}  Y: {position[1].toFixed(3)}  Z: {position[2].toFixed(3)} mm
      </span>
      <span>·</span>
      <span>{transformMode === 'translate' ? 'MOVE' : 'ROTATE'} · {transformSpace.toUpperCase()} · Snap: {snapEnabled ? 'ON' : 'OFF'}</span>
      <div style={{ flex: 1 }} />
      <span>Sprint 1.x · Online-CAD MVP</span>
    </div>
  );
}
