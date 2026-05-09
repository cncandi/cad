import { Eye, EyeOff, Box, ChevronRight } from 'lucide-react';
import { useCadStore } from '../app/cadStore';

const BODIES = [
  { id: 'body-base', name: 'Base Plate' },
  { id: 'body-column', name: 'Column' },
  { id: 'body-cap', name: 'Cap' },
];

export function ModelBrowser() {
  const { selectedBodyId, selection, toggleBodyVisibility, bodyVisibility, setSelection } =
    useCadStore();

  return (
    <div style={{
      width: 220, height: '100%', overflow: 'auto',
      background: '#13171d',
      borderRight: '1px solid #1e2530',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', fontSize: 11, fontWeight: 600,
        color: '#4a6080', borderBottom: '1px solid #1e2530',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Model
      </div>

      {/* Document root */}
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 12, color: '#5a7090', padding: '3px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChevronRight size={12} />
          <span>Demo Assembly</span>
        </div>

        <div style={{ paddingLeft: 12, marginTop: 2 }}>
          <div style={{ fontSize: 11, color: '#3d5068', padding: '2px 4px', marginBottom: 2 }}>
            Bodies
          </div>
          {BODIES.map((body) => {
            const isSelected = selectedBodyId === body.id || selection?.bodyId === body.id;
            const visible = bodyVisibility[body.id] !== false;
            return (
              <div
                key={body.id}
                onClick={() =>
                  setSelection(isSelected ? null : { type: 'body', bodyId: body.id })
                }
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                  background: isSelected ? '#1a3050' : 'transparent',
                  marginBottom: 1,
                }}
              >
                <Box size={13} color={isSelected ? '#60a5fa' : '#4a6080'} />
                <span style={{
                  flex: 1, fontSize: 12,
                  color: isSelected ? '#90c4f8' : '#7a9ab8',
                }}>
                  {body.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBodyVisibility(body.id);
                  }}
                  style={{
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', color: visible ? '#4a6080' : '#2a3a50',
                    padding: 0, display: 'flex',
                  }}
                >
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
