# Online-CAD Direct-Editing MVP

Browser-basierter CAD-Prototyp für STEP-Direct-Editing mit OpenCascade.js, Three.js und C#.

## Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | Vite + React + TypeScript |
| 3D-Rendering | Three.js (OrbitControls, TransformControls) |
| State | Zustand |
| CAD-Kernel | OpenCascade.js (Sprint 2), DemoCadAdapter (Sprint 1) |
| Backend | ASP.NET Core Web API |

## Start

### Client
```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

### Server
```bash
dotnet run --project server/CadProjects.Api
# → http://localhost:5000
```

## Architektur

```
online-cad-direct-edit/
├── client/                    # Vite + React + TypeScript
│   └── src/
│       ├── app/               # App, Layout
│       ├── viewer/            # Three.js Viewport, Kamera, Gizmo, Selektion
│       ├── cad/               # Datenmodell, Adapter, History
│       ├── tools/             # Move/Rotate Tools
│       └── ui/                # Ribbon, ModelBrowser, TransformPanel, StatusBar
└── server/                    # ASP.NET Core Web API
    └── CadProjects.Api/       # Projekt- und Upload-Stub
```

## Shortcuts

| Taste | Funktion |
|-------|----------|
| W | Translate-Modus |
| E | Rotate-Modus |
| Q | World/Local umschalten |
| Shift | Snap temporär deaktivieren |
| Esc | Drag abbrechen / Auswahl lösen |
| F | Kamera auf Auswahl zoomen |

## Nächste Schritte (Sprint 2)
- OpenCascade.js WASM laden und OccAdapter aktivieren
- STEP-Import und -Export
- Face-Pull und Hole-Close
- Worker für CAD-Kernel

## Auftraggeber
Andreas Reitz | Stand: 2026-05
