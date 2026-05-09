import { useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Ribbon } from '../ui/Ribbon';
import { ModelBrowser } from '../ui/ModelBrowser';
import { TransformPanel } from '../ui/TransformPanel';
import { StatusBar } from '../ui/StatusBar';
import { CadViewport } from '../viewer/CadViewport';
import { useCadStore } from './cadStore';

export function AppLayout() {
  const { theme, toggleTheme } = useCadStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw', height: '100vh',
      background: 'var(--bg0)', overflow: 'hidden',
      transition: 'background 0.2s',
    }}>
      {/* Top bar with theme toggle */}
      <div style={{
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--border)',
        padding: '5px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        height: 36, flexShrink: 0,
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 5,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 600, fontSize: 13, flexShrink: 0,
        }}>C</div>
        <span style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 500 }}>
          Demo Assembly
        </span>
        <div style={{ flex: 1 }} />
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Zu dunklem Design wechseln' : 'Zu hellem Design wechseln'}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
            padding: '3px 8px',
            display: 'flex', alignItems: 'center', gap: 5,
            color: 'var(--text2)',
            fontSize: 11,
            transition: 'background 0.15s, border-color 0.15s',
          }}
        >
          {theme === 'light'
            ? <><Moon size={13} /> Dark</>
            : <><Sun size={13} /> Light</>}
        </button>
        <button style={{
          background: 'rgba(37,99,235,0.12)',
          border: '1px solid rgba(37,99,235,0.4)',
          borderRadius: 5, color: 'var(--accent)',
          fontFamily: 'inherit', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
        }}>Share ↗</button>
        <button style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 5, color: 'var(--text2)',
          fontFamily: 'inherit', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
        }}>Export</button>
      </div>

      <Ribbon />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ModelBrowser />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <CadViewport />
        </div>
        <TransformPanel />
      </div>
      <StatusBar />
    </div>
  );
}
