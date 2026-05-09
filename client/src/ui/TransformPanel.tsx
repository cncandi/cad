import { Globe, Box, ToggleLeft, ToggleRight } from 'lucide-react';
import { useCadStore } from '../app/cadStore';

export function TransformPanel() {
  const {
    selection, selectedBodyId,
    transformMode, setTransformMode,
    transformSpace, setTransformSpace,
    snapEnabled, setSnapEnabled,
    position, rotation,
    operations,
  } = useCadStore();

  const hasSelection = !!selectedBodyId;

  return (
    <div style={{
      width: 220, height: '100%', overflow: 'auto',
      background: '#13171d',
      borderLeft: '1px solid #1e2530',
      display: 'flex', flexDirection: 'column',
      fontSize: 12, color: '#7a9ab8',
    }}>
      {/* Transform section */}
      <Section label="Transform">
        {/* Mode */}
        <Row label="Mode">
          <ModeBtn label="Move" active={transformMode === 'translate'} onClick={() => setTransformMode('translate')} />
          <ModeBtn label="Rotate" active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} />
        </Row>

        {/* Space */}
        <Row label="Space">
          <button onClick={() => setTransformSpace('world')} style={spaceBtn(transformSpace === 'world')}>
            <Globe size={11} /> World
          </button>
          <button onClick={() => setTransformSpace('local')} style={spaceBtn(transformSpace === 'local')}>
            <Box size={11} /> Local
          </button>
        </Row>

        {/* Snap */}
        <Row label="Snap">
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: snapEnabled ? '#60a5fa' : '#3d5068', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {snapEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {snapEnabled ? 'On (0.5 mm)' : 'Off'}
          </button>
        </Row>
      </Section>

      {/* Position */}
      <Section label="Position (mm)">
        {hasSelection ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
            <XYZRow label="X" value={position[0]} color="#f97171" />
            <XYZRow label="Y" value={position[1]} color="#71f988" />
            <XYZRow label="Z" value={position[2]} color="#71a8f9" />
          </div>
        ) : (
          <span style={{ color: '#3d5068', padding: '0 4px' }}>—</span>
        )}
      </Section>

      {/* Rotation */}
      <Section label="Rotation (°)">
        {hasSelection ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
            <XYZRow label="X" value={rotation[0]} color="#f97171" />
            <XYZRow label="Y" value={rotation[1]} color="#71f988" />
            <XYZRow label="Z" value={rotation[2]} color="#71a8f9" />
          </div>
        ) : (
          <span style={{ color: '#3d5068', padding: '0 4px' }}>—</span>
        )}
      </Section>

      {/* Selection info */}
      <Section label="Selection">
        {selection ? (
          <div style={{ padding: '0 4px', color: '#90c4f8' }}>
            <div style={{ marginBottom: 2 }}>{selection.type}: {selection.bodyId}</div>
          </div>
        ) : (
          <span style={{ color: '#3d5068', padding: '0 4px' }}>None</span>
        )}
      </Section>

      {/* History */}
      <Section label={`History (${operations.length})`}>
        <div style={{ maxHeight: 160, overflow: 'auto', padding: '0 4px' }}>
          {operations.length === 0 && (
            <span style={{ color: '#3d5068' }}>No operations yet</span>
          )}
          {[...operations].reverse().map((op) => (
            <div key={op.id} style={{
              padding: '3px 0', borderBottom: '1px solid #1a2030',
              fontSize: 11, color: '#6080a0',
            }}>
              <span style={{ color: '#4a90d0' }}>{op.type}</span>{' '}
              <span style={{ color: '#3d5068' }}>{op.targetId.replace('body-', '')}</span>
              <br />
              <span style={{ color: '#2d4060' }}>{op.createdAt.slice(11, 19)}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Direct Edit */}
      <Section label="Direct Edit">
        {[
          'Move Face', 'Move Body', 'Extend Face', 'Offset Face', 'Close Hole', 'Delete Face',
        ].map((op) => (
          <button key={op} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#4a6080', padding: '3px 4px', textAlign: 'left',
            fontSize: 11, width: '100%', borderRadius: 3,
          }}>
            {op}
          </button>
        ))}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid #1a2030' }}>
      <div style={{
        padding: '6px 12px 4px', fontSize: 10, fontWeight: 600,
        color: '#3d5068', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </div>
      <div style={{ padding: '0 8px 8px' }}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ width: 48, color: '#3d5068', fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>{children}</div>
    </div>
  );
}

function ModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11,
      background: active ? '#1e3a5f' : '#1a2030',
      color: active ? '#60a5fa' : '#4a6080',
    }}>
      {label}
    </button>
  );
}

function XYZRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, color, fontSize: 11, fontWeight: 600 }}>{label}</span>
      <div style={{
        flex: 1, background: '#1a2030', borderRadius: 4,
        padding: '2px 6px', fontSize: 11, color: '#90b8e0',
        fontFamily: 'monospace',
      }}>
        {value}
      </div>
    </div>
  );
}

function spaceBtn(active: boolean): React.CSSProperties {
  return {
    padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11,
    background: active ? '#1e3a5f' : '#1a2030',
    color: active ? '#60a5fa' : '#4a6080',
    display: 'flex', alignItems: 'center', gap: 4,
  };
}
