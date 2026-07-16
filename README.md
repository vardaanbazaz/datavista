# DataVista

> **Offline-first, browser-based Business Intelligence platform.**

DataVista is a modern, responsive, and entirely client-side Business Intelligence platform. It allows users to upload datasets (CSV, Excel), design analytical pipelines, write calculations, evaluate window partitions, structure pivot tables, and visualize results—all running securely in the browser without sending data to any external server.

---

## Key Features

* **Zero-Server Processing**: Everything runs directly in the browser. Datasets remain private and secure.
* **Offline-First Storage**: Powered by IndexedDB (via Dexie) to persist datasets, dashboards, and charts across browser reloads.
* **Calculated Fields & Expression Library**: Full-featured custom formula language including Math, String, Date, and Logical functions.
* **Multidimensional Pivot Table Engine**: Drag-and-drop row groups, column groups, and aggregations supporting distinct counts, weighted averages, and percentiles.
* **Advanced Aggregations**: Supports `COUNT_DISTINCT`, `WEIGHTED_AVERAGE`, `PERCENTILE`, `SUM_IF`, and `COUNT_IF`.
* **Window & Ranking Functions**: Compute moving averages, running totals, lag, lead, ranks, and dense ranks over custom partitions.
* **Query Optimizer**: LRU caching and execution plans skip redundant pipeline evaluations to maximize rendering speed.
* **High-Performance UI**: Fully virtualized tables and responsive charts (using TanStack Virtual and D3/recharts).

---

## Architecture Overview

DataVista relies on a multi-stage, client-side analytical pipeline:

```
[ Raw Dataset ]
      │
      ▼
[ Metadata Layer ] ──> Infers column types & registers fields
      │
      ▼
[ Formula Engine ] ──> Evaluates user-defined AST expressions
      │
      ▼
[ Query Optimizer ] ──> Intercepts query, evaluates plan, looks up cache
      │
      ├─ Cache Hit ──> Slices & Paginated Output
      └─ Cache Miss ─┐
                     ▼
             [ Query Engine ]
                     ├─ applyFilters
                     ├─ applySorting
                     ├─ applyGroupingAndAggregations (Advanced Aggregations)
                     ├─ applyWindowFunctions
                     └─ paginate
```

All computationally heavy steps are designed to run in parallel Web Workers to prevent blocking the main rendering thread.

---

## Tech Stack

* **Core Framework**: React 18, TypeScript, Vite
* **State Management**: Zustand
* **Database & Persistence**: Dexie (IndexedDB wrapper)
* **Styling & UI Components**: Tailwind CSS, shadcn/ui, Lucide Icons
* **Data Visualization**: D3.js, Recharts
* **Grid Virtualization**: TanStack Virtual

---

## Getting Started

### Prerequisites

* Node.js (v18 or higher recommended)
* npm

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`.

### Production Build

To build the static application assets:
```bash
npm run build
```
The output will be placed in the `dist/` directory.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
