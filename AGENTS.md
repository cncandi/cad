# AGENTS.md

## Projektziel
Browserbasiertes Online-CAD für STEP Direct Editing.
Priorität 1: Gimbal/Manipulator für Body- und Face-Transformationen.

## Regeln
- TypeScript strict beibehalten.
- React-Komponenten klein halten.
- Three.js nur für Anzeige und Interaktion verwenden.
- CAD-Operationen über CadKernelAdapter kapseln.
- Während Dragging nur Preview; Commit erst bei DragEnd.
- Operationen immer in OperationHistory speichern.
- Keine Marken, Logos oder 1:1 Kopien bestehender CAD-Produkte verwenden.

## Build
- client: `npm install` → `npm run dev` → `npm run build`
- server: `dotnet run --project server/CadProjects.Api`

## Architektur
```
CadViewport        → Canvas, Kamera, Rendering, Events (keine CAD-Ops)
SelectionManager   → Raycast, Treffer, Face/Body-ID (kein BRep-Eingriff)
TransformGizmo     → Gimbal, Matrix-Delta (kein direktes Commit)
CadDocument        → Bodies, Faces, Meshes, IDs, History (kein UI-State)
OccAdapter         → STEP laden, B-Rep, triangulieren, exportieren
DemoCadAdapter     → Demo-Geometrie für Sprint 1
```

## Tests vor jeder Übergabe
- TypeScript Build: `cd client && npm run build`
- App im Browser manuell prüfen
- Gimbal Move/Rotate testen
- README aktualisieren

## Sprints
- Sprint 1.1: Monorepo + client/server startbar
- Sprint 1.2: CAD-Layout (Ribbon, Browser, Viewport, Inspector)
- Sprint 1.3: Three.js Szene mit Demo-Bauteil
- Sprint 1.4: Selektion per Raycaster
- Sprint 1.5: Gimbal (TransformControls)
- Sprint 1.6: Move/Rotate + Snap
- Sprint 1.7: Operation History
- Sprint 1.8: OccAdapter Interface vorbereiten
- Sprint 1.9: README + AGENTS.md finalisieren
