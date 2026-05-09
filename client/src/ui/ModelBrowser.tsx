import { Eye, EyeOff, Box, ChevronRight } from 'lucide-react';
import { useCadStore } from '../app/cadStore';

const BODIES = [
  { id: 'body-base', name: 'Base Plate' },
  { id: 'body-column', name: 'Column' },
  { id: 'body-cap', name: 'Cap' },
];

export function ModelBrowser() {
  const { selectedBodyId, selection, toggleBodyVisibility, bodyVisibility, setSelection } = useCadStore();

  return (
    <div style={{
      width: 220, height: '100%', overflow: 'auto',
      background: 'var(--bg1)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '7px 12px', fontSize: 11, fontWeight: 600,
        color: 'var(--text3)', borderBottom: '1px solid var(--border)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>Model</div>

      <div style={{ padding: '6px 8px', flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', padding: '3px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChevronRight size={12} />
          <span>Demo Assembly</span>
        </div>
        <div style={{ paddingLeft: 12, marginTop: 2 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', padding: '2px 4px', marginBottom: 2 }}>Bodies</div>
          {BODIES.map((body) => {
            const isSelected = selectedBodyId === body.id || selection?.bodyId === body.id;
            const visible = bodyVisibility[body.id] !== false;
            return (
              <div key={body.id}
                onClick={() => setSelection(isSelected ? null : { type: 'body', bodyId: body.id })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                  background: isSelected ? 'var(--sel)' : 'transparent',
                  marginBottom: 1,
                }}>
                <Box size={13} color={isSelected ? 'var(--accent)' : 'var(--text3)'} />
                <span style={{ flex: 1, fontSize: 12, color: isSelected ? 'var(--sel-text)' : 'var(--text2)' }}>
                  {body.name}
                </span>
                <button onClick={(e) => { e.stopPropagation(); toggleBodyVisibility(body.id); }}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: visible ? 'var(--text3)' : 'var(--border2)', padding: 0, display: 'flex' }}>
                  {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
