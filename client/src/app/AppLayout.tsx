import { Ribbon } from '../ui/Ribbon';
import { ModelBrowser } from '../ui/ModelBrowser';
import { TransformPanel } from '../ui/TransformPanel';
import { StatusBar } from '../ui/StatusBar';
import { CadViewport } from '../viewer/CadViewport';

export function AppLayout() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw', height: '100vh',
      background: '#0f1318', overflow: 'hidden',
    }}>
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
