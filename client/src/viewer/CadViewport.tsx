import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ViewerScene } from './ViewerScene';
import { useCadStore } from '../app/cadStore';

export function CadViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef  = useRef<ViewerScene | null>(null);
  const { transformSpace, snapEnabled, bodyVisibility, theme, setSelection, addOperation, setPosition, setRotation } = useCadStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new ViewerScene(canvas, {
      onBodySelected: (id, pos) => {
        if (id) { setSelection({ type: 'body', bodyId: id }); setPosition(pos); }
        else    { setSelection(null); setPosition([0,0,0]); setRotation([0,0,0]); }
      },
      onTransformCommit: (id, mat, pos, rot) => {
        const op = scene.getDocument().commitTransform(id, new THREE.Matrix4().fromArray(mat));
        addOperation(op);
        setPosition([+pos.x.toFixed(3), +pos.y.toFixed(3), +pos.z.toFixed(3)]);
        setRotation([
          +THREE.MathUtils.radToDeg(rot.x).toFixed(2),
          +THREE.MathUtils.radToDeg(rot.y).toFixed(2),
          +THREE.MathUtils.radToDeg(rot.z).toFixed(2),
        ]);
      },
      onPositionChange: setPosition,
      onRotationChange: setRotation,
    });

    sceneRef.current = scene;

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      scene.resize(width, height);
    });
    ro.observe(canvas.parentElement!);
    scene.resize(canvas.parentElement!.clientWidth, canvas.parentElement!.clientHeight);

    const onKey = (e: KeyboardEvent) => {
      const s = sceneRef.current;
      if (!s) return;
      switch (e.key.toLowerCase()) {
        case 'q':      useCadStore.getState().setTransformSpace(useCadStore.getState().transformSpace === 'world' ? 'local' : 'world'); break;
        case 'p':      s.startPivotMode(); break;
        case 'f':      s.focusSelection(); break;
        case 'escape': s.cancelDrag(); break;
        case 'shift':  useCadStore.getState().setSnapEnabled(false); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useCadStore.getState().setSnapEnabled(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup',   onKeyUp);

    return () => {
      scene.dispose();
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, []);

  useEffect(() => { sceneRef.current?.setTransformSpace(transformSpace); }, [transformSpace]);
  useEffect(() => { sceneRef.current?.setSnapEnabled(snapEnabled); }, [snapEnabled]);
  useEffect(() => {
    Object.entries(bodyVisibility).forEach(([id, v]) => sceneRef.current?.setBodyVisibility(id, v));
  }, [bodyVisibility]);
  useEffect(() => { sceneRef.current?.setTheme(theme); }, [theme]);

  const dark = theme === 'dark';
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: dark ? '#0d1117' : '#e8edf3' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute', top: 12, right: 12,
        width: 62, height: 62, borderRadius: 8,
        background: dark ? 'rgba(22,27,34,0.85)' : 'rgba(255,255,255,0.85)',
        border: `1px solid ${dark ? '#2a3347' : '#d0d8e4'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: dark ? '#5a7090' : '#8898aa', userSelect: 'none',
      }}>VIEW CUBE</div>
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        background: dark ? 'rgba(13,17,23,0.85)' : 'rgba(255,255,255,0.85)',
        border: `1px solid ${dark ? '#2a3347' : '#d0d8e4'}`,
        borderRadius: 6, padding: '3px 12px',
        fontSize: 10, color: dark ? '#5a7090' : '#8898aa', whiteSpace: 'nowrap',
      }}>
        Q Local/World · P Pivot · F Fokus · Esc Abbruch
      </div>
    </div>
  );
}
