import { Globe, Box, ToggleLeft, ToggleRight } from 'lucide-react';
import { useCadStore } from '../app/cadStore';

export function TransformPanel() {
  const {
    selection, selectedBodyId,
    transformMode, setTransformMode,
    transformSpace, setTransformSpace,
    snapEnabled, setSnapEnabled,
    position, rotation, operations,
  } = useCadStore();

  const hasSelection = !!selectedBodyId;

  const panel: React.CSSProperties = {
    width: 220, height: '100%', overflow: 'auto',
    background: 'var(--bg1)',
    borderLeft: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    fontSize: 12, color: 'var(--text2)',
  };

  return (
    <div style={panel}>
      <Section label="Transform">
        <Row label="Mode">
          <ModeBtn label="Move" active={transformMode === 'translate'} onClick={() => setTransformMode('translate')} />
          <ModeBtn label="Rotate" active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} />
        </Row>
        <Row label="Space">
          <SpaceBtn label="World" icon={<Globe size={11} />} active={transformSpace === 'world'} onClick={() => setTransformSpace('world')} />
          <SpaceBtn label="Local" icon={<Box size={11} />} active={transformSpace === 'local'} onClick={() => setTransformSpace('local')} />
        </Row>
        <Row label="Snap">
          <button onClick={() => setSnapEnabled(!snapEnabled)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: snapEnabled ? 'var(--accent)' : 'var(--text3)',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          }}>
            {snapEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {snapEnabled ? 'On (0.5 mm)' : 'Off'}
          </button>
        </Row>
      </Section>

      <Section label="Position (mm)">
        {hasSelection
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <XYZRow label="X" value={position[0]} color="#e05252" />
              <XYZRow label="Y" value={position[1]} color="#3a9e4a" />
              <XYZRow label="Z" value={position[2]} color="#2a72d4" />
            </div>
          : <span style={{ color: 'var(--text3)' }}>—</span>}
      </Section>

      <Section label="Rotation (°)">
        {hasSelection
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <XYZRow label="X" value={rotation[0]} color="#e05252" />
              <XYZRow label="Y" value={rotation[1]} color="#3a9e4a" />
              <XYZRow label="Z" value={rotation[2]} color="#2a72d4" />
            </div>
          : <span style={{ color: 'var(--text3)' }}>—</span>}
      </Section>

      <Section label="Selection">
        {selection
          ? <div style={{ color: 'var(--accent)', fontSize: 11 }}>{selection.type}: {selection.bodyId}</div>
          : <span style={{ color: 'var(--text3)' }}>None</span>}
      </Section>

      <Section label={`History (${operations.length})`}>
        <div style={{ maxHeight: 160, overflow: 'auto' }}>
          {operations.length === 0 && <span style={{ color: 'var(--text3)', fontSize: 11 }}>No operations yet</span>}
          {[...operations].reverse().map((op) => (
            <div key={op.id} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
              <span style={{ color: 'var(--accent)' }}>{op.type}</span>{' '}
              <span style={{ color: 'var(--text3)' }}>{op.targetId.replace('body-', '')}</span>
              <br /><span style={{ color: 'var(--text3)', fontSize: 10 }}>{op.createdAt.slice(11, 19)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Direct Edit">
        {['Move Face','Move Body','Extend Face','Offset Face','Close Hole','Delete Face'].map((op) => (
          <button key={op} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text2)', padding: '3px 0', textAlign: 'left',
            fontSize: 11, width: '100%', borderRadius: 3,
          }}>{op}</button>
        ))}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ padding: '0 10px 8px' }}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ width: 44, color: 'var(--text3)', fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>{children}</div>
    </div>
  );
}

function ModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)',
      cursor: 'pointer', fontSize: 11,
      background: active ? 'var(--sel)' : 'var(--bg2)',
      color: active ? 'var(--accent)' : 'var(--text2)',
    }}>{label}</button>
  );
}

function SpaceBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)',
      cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
      background: active ? 'var(--sel)' : 'var(--bg2)',
      color: active ? 'var(--accent)' : 'var(--text2)',
    }}>{icon}{label}</button>
  );
}

function XYZRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, color, fontSize: 11, fontWeight: 600 }}>{label}</span>
      <div style={{
        flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 4, padding: '2px 6px', fontSize: 11, color: 'var(--text1)',
        fontFamily: 'monospace',
      }}>{value}</div>
    </div>
  );
}
