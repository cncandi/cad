import { Move, RotateCw, MousePointer2, Ruler, Upload, Save, Download, Search } from 'lucide-react';
import { useCadStore } from '../app/cadStore';

const TABS = ['Home', 'Direct Edit', 'Measure', 'Prepare', 'Export'];

export function Ribbon() {
  const { transformMode, setTransformMode } = useCadStore();

  return (
    <div style={{ background: 'var(--bg1)', borderBottom: '1px solid var(--border)', userSelect: 'none' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', padding: '0 14px', gap: 2, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((tab) => (
          <div key={tab} style={{
            padding: '5px 14px', fontSize: 12,
            color: tab === 'Home' ? 'var(--accent)' : 'var(--text3)',
            borderBottom: tab === 'Home' ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
          }}>{tab}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <button style={topIconBtn}><Upload size={14} /></button>
          <button style={topIconBtn}><Save size={14} /></button>
          <button style={topIconBtn}><Download size={14} /></button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 5, padding: '2px 8px',
            fontSize: 11, color: 'var(--text3)',
          }}>
            <Search size={12} /><span>Search…</span>
          </div>
        </div>
      </div>

      {/* Tool ribbon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 14px' }}>
        <RibbonGroup label="Select">
          <ToolBtn icon={<MousePointer2 size={15} />} label="Select" active={false} />
        </RibbonGroup>
        <Sep />
        <RibbonGroup label="Transform">
          <ToolBtn icon={<Move size={15} />} label="Move"
            active={transformMode === 'translate'} onClick={() => setTransformMode('translate')} />
          <ToolBtn icon={<RotateCw size={15} />} label="Rotate"
            active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} />
        </RibbonGroup>
        <Sep />
        <RibbonGroup label="Direct Edit">
          <ToolBtn icon={<Move size={15} />} label="Move Face" active={false} />
          <ToolBtn icon={<Move size={15} />} label="Move Body" active={false} />
        </RibbonGroup>
        <Sep />
        <RibbonGroup label="Measure">
          <ToolBtn icon={<Ruler size={15} />} label="Measure" active={false} />
        </RibbonGroup>
      </div>
    </div>
  );
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', gap: 1 }}>{children}</div>
      <span style={{ fontSize: 10, color: 'var(--text3)' }}>{label}</span>
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 38, background: 'var(--border)', margin: '0 6px' }} />;
}

function ToolBtn({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '4px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
      background: active ? 'var(--sel)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text2)',
      fontSize: 10, minWidth: 44, transition: 'background 0.12s',
    }}>
      {icon}{label}
    </button>
  );
}

const topIconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--text3)', padding: 4, borderRadius: 4, display: 'flex',
};
