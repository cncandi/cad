import { Move, RotateCw, MousePointer2, Ruler, Upload, Save, Download, Search } from 'lucide-react';
import { useCadStore } from '../app/cadStore';

const TABS = ['Home', 'Direct Edit', 'Measure', 'Prepare', 'Export'];

export function Ribbon() {
  const { transformMode, setTransformMode, documentName } = useCadStore();

  return (
    <div style={{
      background: '#161a20',
      borderBottom: '1px solid #2a3040',
      userSelect: 'none',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '6px 14px', gap: 12,
        borderBottom: '1px solid #1e2530',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: '#2563eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 14,
        }}>C</div>
        <span style={{ color: '#c8d6e5', fontSize: 13, fontWeight: 500 }}>{documentName}</span>
        <div style={{ flex: 1 }} />
        <button style={iconBtnStyle}><Upload size={15} /></button>
        <button style={iconBtnStyle}><Save size={15} /></button>
        <button style={iconBtnStyle}><Download size={15} /></button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#1e2530', borderRadius: 6, padding: '4px 10px',
          fontSize: 12, color: '#5a7080',
        }}>
          <Search size={13} />
          <span>Search commands…</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', padding: '0 14px', gap: 2 }}>
        {TABS.map((tab) => (
          <div key={tab} style={{
            padding: '5px 14px', fontSize: 12,
            color: tab === 'Home' ? '#60a5fa' : '#6b7e94',
            borderBottom: tab === 'Home' ? '2px solid #2563eb' : '2px solid transparent',
            cursor: 'pointer',
          }}>{tab}</div>
        ))}
      </div>

      {/* Tool ribbon */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '6px 14px',
      }}>
        <RibbonGroup label="Select">
          <ToolButton icon={<MousePointer2 size={16} />} label="Select" active={false} />
        </RibbonGroup>
        <RibbonSep />
        <RibbonGroup label="Transform">
          <ToolButton
            icon={<Move size={16} />} label="Move"
            active={transformMode === 'translate'}
            onClick={() => setTransformMode('translate')}
          />
          <ToolButton
            icon={<RotateCw size={16} />} label="Rotate"
            active={transformMode === 'rotate'}
            onClick={() => setTransformMode('rotate')}
          />
        </RibbonGroup>
        <RibbonSep />
        <RibbonGroup label="Direct Edit">
          <ToolButton icon={<Move size={16} />} label="Move Face" active={false} />
          <ToolButton icon={<Move size={16} />} label="Move Body" active={false} />
        </RibbonGroup>
        <RibbonSep />
        <RibbonGroup label="Measure">
          <ToolButton icon={<Ruler size={16} />} label="Measure" active={false} />
        </RibbonGroup>
      </div>
    </div>
  );
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', gap: 2 }}>{children}</div>
      <span style={{ fontSize: 10, color: '#3d5068' }}>{label}</span>
    </div>
  );
}

function RibbonSep() {
  return <div style={{ width: 1, height: 40, background: '#2a3040', margin: '0 6px' }} />;
}

function ToolButton({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '4px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
        background: active ? '#1e3a5f' : 'transparent',
        color: active ? '#60a5fa' : '#7a8fa8',
        fontSize: 10, minWidth: 44,
        transition: 'background 0.15s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: '#6b7e94', padding: 4, borderRadius: 4, display: 'flex',
};
