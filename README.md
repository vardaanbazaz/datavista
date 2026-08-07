# DataVista 📊 

![Build Status](https://img.shields.io/github/actions/workflow/status/vardaanbazaz/datavista/deploy.yml?branch=main)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=flat&logo=react&logoColor=61DAFB)
![License](https://img.shields.io/badge/License-MIT-green.svg)

**DataVista** is an offline-first, browser-native Business Intelligence (BI) and analytics platform. 

### 📖 What is DataVista? (The Layman's Explanation)
Imagine taking the massive analytical power of enterprise tools like **Microsoft Power BI** or **Tableau** and cramming it entirely into your web browser. 

Normally, when you upload a spreadsheet to a data tool, your private data is sent to a remote server to be processed. **DataVista flips this model.** It uses your browser's internal storage and computing power to process, slice, and visualize multi-megabyte datasets locally. Your data never leaves your machine. 

Simply drag and drop a CSV or Excel file, and you instantly get access to interactive pivot tables, statistical analysis, complex formula parsing, and an AI Co-Pilot—all running at lightning speed directly on your device.

---

## 📸 Platform Gallery

*(Note: Replace these placeholder paths with actual screenshots of your application)*

| Overview Dashboard | Pivot Explorer |
| :---: | :---: |
| ![Dashboard](docs/dashboard-screenshot.png) <br> *Real-time metrics and executive summaries* | ![Pivot](docs/pivot-screenshot.png) <br> *Multidimensional data aggregation* |

| AI Co-Pilot | Advanced Charting |
| :---: | :---: |
| ![AI Copilot](docs/ai-screenshot.png) <br> *Natural language queries via Gemini/GPT-4o* | ![Charts](docs/charts-screenshot.png) <br> *Over 8 interactive visualization types* |

---

## 🧠 System Architecture

DataVista bypasses traditional backend servers by utilizing a modular, engine-driven architecture completely housed within the client layer. 

```mermaid
graph TD
    subgraph UI Layer [React 18 User Interface]
        A[Dashboard & Charts]
        B[Command Palette ⌘K]
        C[Joyride Onboarding]
    end

    subgraph State Management [Zustand + Persist]
        D[UI & Theme Store]
        E[Workspace & History Store]
    end

    subgraph Analytical Engines [Core Processing]
        F[AST Formula Parser]
        G[Pivot Aggregation Engine]
        H[Statistical Math Engine]
    end

    subgraph Data Persistence [Browser Storage]
        I[(IndexedDB / Dexie.js)]
        J[Local Storage]
    end

    subgraph External AI APIs
        K[Google Gemini API]
        L[OpenAI GPT-4o API]
    end

    %% Flow connections
    A & B & C <--> D & E
    E <--> F & G & H
    F & G & H <--> I
    D <--> J
    E <--> K & L
```
