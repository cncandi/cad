import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ViewerScene } from './ViewerScene';
import { useCadStore } from '../app/cadStore';

export function CadViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ViewerScene | null>(null);

  const {
    transformMode,
    transformSpace,
    snapEnabled,
    bodyVisibility,
    setSelection,
    addOperation,
    setPosition,
    setRotation,
  } = useCadStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new ViewerScene(canvas, {
      onBodySelected: (bodyId, position) => {
        if (bodyId) {
          setSelection({ type: 'body', bodyId });
          setPosition(position);
        } else {
          setSelection(null);
          setPosition([0, 0, 0]);
          setRotation([0, 0, 0]);
        }
      },
      onTransformCommit: (bodyId, matrix, pos, rot) => {
        const { getHistory } = scene.getDocument();
        // Op already written in ViewerScene via cadDocument.commitTransform
        const op = scene.getDocument().commitTransform(bodyId, new THREE.Matrix4().fromArray(matrix));
        addOperation(op);
        setPosition([
          parseFloat(pos.x.toFixed(3)),
          parseFloat(pos.y.toFixed(3)),
          parseFloat(pos.z.toFixed(3)),
        ]);
        setRotation([
          parseFloat(THREE.MathUtils.radToDeg(rot.x).toFixed(2)),
          parseFloat(THREE.MathUtils.radToDeg(rot.y).toFixed(2)),
          parseFloat(THREE.MathUtils.radToDeg(rot.z).toFixed(2)),
        ]);
        void getHistory;
      },
      onPositionChange: setPosition,
      onRotationChange: setRotation,
    });

    sceneRef.current = scene;

    // Resize observer
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      scene.resize(width, height);
    });
    observer.observe(canvas.parentElement!);
    const parent = canvas.parentElement!;
    scene.resize(parent.clientWidth, parent.clientHeight);

    // Keyboard shortcuts
    const onKey = (e: KeyboardEvent) => {
      if (!sceneRef.current) return;
      switch (e.key.toLowerCase()) {
        case 'w':
          useCadStore.getState().setTransformMode('translate');
          break;
        case 'e':
          useCadStore.getState().setTransformMode('rotate');
          break;
        case 'q':
          useCadStore.getState().setTransformSpace(
            useCadStore.getState().transformSpace === 'world' ? 'local' : 'world'
          );
          break;
        case 'f':
          sceneRef.current.focusSelection();
          break;
        case 'escape':
          sceneRef.current.cancelDrag();
          break;
        case 'shift':
          useCadStore.getState().setSnapEnabled(false);
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        useCadStore.getState().setSnapEnabled(true);
      }
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

  // Sync store → scene
  useEffect(() => {
    sceneRef.current?.setTransformMode(transformMode);
  }, [transformMode]);

  useEffect(() => {
    sceneRef.current?.setTransformSpace(transformSpace);
  }, [transformSpace]);

  useEffect(() => {
    sceneRef.current?.setSnapEnabled(snapEnabled);
  }, [snapEnabled]);

  useEffect(() => {
    Object.entries(bodyVisibility).forEach(([id, visible]) => {
      sceneRef.current?.setBodyVisibility(id, visible);
    });
  }, [bodyVisibility]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {/* ViewCube placeholder */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        width: 64, height: 64, borderRadius: 8,
        background: 'rgba(30,34,40,0.75)',
        border: '1px solid #2d3748',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: '#8899aa', userSelect: 'none',
      }}>
        VIEW CUBE
      </div>

      {/* Mini toolbar */}
      <div style={{
        position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(22,26,32,0.92)',
        border: '1px solid #2d3748',
        borderRadius: 8, padding: '4px 12px',
        fontSize: 11, color: '#8899aa',
        userSelect: 'none',
      }}>
        W Move · E Rotate · Q Local/World · Shift=Snap off · F Focus · Esc Deselect
      </div>
    </div>
  );
}
