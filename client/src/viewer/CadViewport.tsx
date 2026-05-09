import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ViewerScene } from './ViewerScene';
import { useCadStore } from '../app/cadStore';

export function CadViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ViewerScene | null>(null);

  const {
    transformMode, transformSpace, snapEnabled,
    bodyVisibility, theme,
    setSelection, addOperation, setPosition, setRotation,
  } = useCadStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new ViewerScene(canvas, {
      onBodySelected: (bodyId, position) => {
        if (bodyId) { setSelection({ type: 'body', bodyId }); setPosition(position); }
        else { setSelection(null); setPosition([0, 0, 0]); setRotation([0, 0, 0]); }
      },
      onTransformCommit: (bodyId, matrix, pos, rot) => {
        const op = scene.getDocument().commitTransform(bodyId, new THREE.Matrix4().fromArray(matrix));
        addOperation(op);
        setPosition([parseFloat(pos.x.toFixed(3)), parseFloat(pos.y.toFixed(3)), parseFloat(pos.z.toFixed(3))]);
        setRotation([
          parseFloat(THREE.MathUtils.radToDeg(rot.x).toFixed(2)),
          parseFloat(THREE.MathUtils.radToDeg(rot.y).toFixed(2)),
          parseFloat(THREE.MathUtils.radToDeg(rot.z).toFixed(2)),
        ]);
      },
      onPositionChange: setPosition,
      onRotationChange: setRotation,
    });

    sceneRef.current = scene;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      scene.resize(width, height);
    });
    observer.observe(canvas.parentElement!);
    const parent = canvas.parentElement!;
    scene.resize(parent.clientWidth, parent.clientHeight);

    const onKey = (e: KeyboardEvent) => {
      if (!sceneRef.current) return;
      switch (e.key.toLowerCase()) {
        case 'w': useCadStore.getState().setTransformMode('translate'); break;
        case 'e': useCadStore.getState().setTransformMode('rotate'); break;
        case 'q': useCadStore.getState().setTransformSpace(
          useCadStore.getState().transformSpace === 'world' ? 'local' : 'world'
        ); break;
        case 'f': sceneRef.current.focusSelection(); break;
        case 'escape': sceneRef.current.cancelDrag(); break;
        case 'shift': useCadStore.getState().setSnapEnabled(false); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useCadStore.getState().setSnapEnabled(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      scene.dispose();
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => { sceneRef.current?.setTransformMode(transformMode); }, [transformMode]);
  useEffect(() => { sceneRef.current?.setTransformSpace(transformSpace); }, [transformSpace]);
  useEffect(() => { sceneRef.current?.setSnapEnabled(snapEnabled); }, [snapEnabled]);
  useEffect(() => {
    Object.entries(bodyVisibility).forEach(([id, visible]) => {
      sceneRef.current?.setBodyVisibility(id, visible);
    });
  }, [bodyVisibility]);

  // Update Three.js scene background on theme change
  useEffect(() => {
    sceneRef.current?.setTheme(theme);
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: isDark ? '#0d1117' : '#e8edf3' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* ViewCube */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        width: 62, height: 62, borderRadius: 8,
        background: isDark ? 'rgba(22,27,34,0.85)' : 'rgba(255,255,255,0.85)',
        border: `1px solid ${isDark ? '#2a3347' : '#d0d8e4'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: isDark ? '#5a7090' : '#8898aa', userSelect: 'none',
        backdropFilter: 'blur(4px)',
      }}>VIEW CUBE</div>

      {/* Shortcut hint */}
      <div style={{
        position: 'absolute', bottom: 38, left: '50%', transform: 'translateX(-50%)',
        background: isDark ? 'rgba(13,17,23,0.85)' : 'rgba(255,255,255,0.85)',
        border: `1px solid ${isDark ? '#2a3347' : '#d0d8e4'}`,
        borderRadius: 6, padding: '3px 12px',
        fontSize: 10, color: isDark ? '#5a7090' : '#8898aa', whiteSpace: 'nowrap',
        backdropFilter: 'blur(4px)',
      }}>
        W Move · E Rotate · Q Local/World · Shift=Snap off · F Focus · Esc Deselect
      </div>

      {/* Coordinates */}
      <div style={{
        position: 'absolute', bottom: 10, right: 12,
        fontFamily: 'monospace', fontSize: 10,
        color: isDark ? '#5a7090' : '#8898aa', display: 'flex', gap: 10,
      }}>
        <span><span style={{ color: '#e05252' }}>X</span> 0.000</span>
        <span><span style={{ color: '#3a9e4a' }}>Y</span> 0.000</span>
        <span><span style={{ color: '#2a72d4' }}>Z</span> 0.000</span>
      </div>
    </div>
  );
}
