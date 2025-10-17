# AEO Analyzer - React Frontend

A modern React-based Answer Engine Optimization (AEO) analyzer with web crawler integration and comprehensive SEO analysis tools.

## 🚀 Quick Start

### Development (Both Frontend & Backend)
```bash
# Install dependencies (if not already done)
npm install

# Run both frontend and backend
npm run dev:full
```

### Development (Individual)
```bash
# Backend only (port 3004)
npm run dev

# Frontend only (port 3000)
npm run dev:frontend
```

## 📁 Project Structure

```
├── src/
│   ├── frontend/                    # React frontend
│   │   ├── components/              # Organized components
│   │   │   ├── audit/              # Audit-related components
│   │   │   │   ├── AuditScheduleManager.tsx
│   │   │   │   └── AuditsPage.tsx
│   │   │   ├── crawler/            # Crawler & analysis components
│   │   │   │   ├── DataViewer.tsx
│   │   │   │   ├── LinkExplorer.tsx
│   │   │   │   ├── WebTree.tsx
│   │   │   │   ├── FixedWebTree.tsx
│   │   │   │   ├── D3TidyTree.tsx
│   │   │   │   └── ResultsDisplay.tsx
│   │   │   ├── scheduler/          # Scheduling components
│   │   │   │   ├── ScheduleForm.tsx
│   │   │   │   ├── ScheduleList.tsx
│   │   │   │   └── CronHistory.tsx
│   │   │   └── seo/                # SEO components
│   │   │       └── SeoQueueManager.tsx
│   │   ├── App.tsx                 # Main application component
│   │   ├── App.css                 # Global styles
│   │   ├── main.tsx                # React entry point
│   │   ├── api.ts                  # API service layer
│   │   └── index.css               # Base styles
│   ├── routes/                     # Backend API routes
│   │   ├── aeo.routes.ts          # AEO analysis endpoints
│   │   ├── seo.routes.ts          # SEO endpoints
│   │   ├── audits.routes.ts       # Audit endpoints
│   │   └── ...
│   ├── crawler.ts                  # Web crawler logic
│   ├── server.ts                   # Express server
│   ├── database/                   # Database services
│   ├── scheduler/                  # Scheduling services
│   └── ...
├── aeo-api/                        # Python AEO API service
│   ├── app/
│   │   ├── services/              # AEO analysis services
│   │   └── routes/                # Python API routes
│   └── ...
├── docs/                           # Documentation & data files
├── config/                         # Configuration files
├── index.html                      # React app template
├── vite.config.ts                 # Vite configuration
└── package.json
```

## 🎯 Features

### AEO Analysis
- ✅ **AI Presence Detection** - Identifies AI-generated content
- ✅ **Answerability Score** - Measures content quality for AI responses
- ✅ **Competitor Analysis** - Analyzes competing content
- ✅ **Crawler Accessibility** - Checks if content is crawlable
- ✅ **Knowledge Base Integration** - Enhances AI understanding

### Web Crawler
- ✅ **Site-wide crawling** with Crawlee (Cheerio + Playwright)
- ✅ **Real-time monitoring** via Server-Sent Events
- ✅ **Link analysis** and visualization (tree/graph views)
- ✅ **Performance audits** via PageSpeed Insights
- ✅ **SEO analysis** and data extraction

### Frontend Features
- ✅ **Modern React UI** with organized component structure
- ✅ **Real-time updates** and progress tracking
- ✅ **Data visualization** (DataViewer, WebTree, LinkExplorer)
- ✅ **Scheduling system** with cron support
- ✅ **Audit management** for performance testing
- ✅ **SEO queue management** with Redis integration
- ✅ **Export capabilities** (JSON, CSV, TXT, XML)

### Backend Services
- ✅ **Node.js + TypeScript** backend with Express
- ✅ **Python AEO API** for AI-powered analysis
- ✅ **Redis queue** for background processing
- ✅ **SQLite database** for data persistence
- ✅ **Scheduler service** for automated tasks
- ✅ **Monitoring & health checks**

## 🔧 Development

### Frontend Development
- **Port**: 3000
- **Hot reload**: Yes (Vite)
- **Proxy**: API calls proxied to backend (port 3004)

### Backend Development
- **Port**: 3004
- **API endpoints**: `/api/*`, `/crawl`, `/events`, `/queue/*`

## 📦 Build

```bash
# Build backend
npm run build

# Build frontend
npm run build:frontend
```

## 🌐 Access

- **React Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3004

## 🏗️ Architecture

### Frontend (React + Vite)
- **Port 3000** during development
- Hot module replacement for fast development
- TypeScript for type safety
- Organized component structure by feature

### Node.js Backend (Express)
- **Port 3004** 
- RESTful API endpoints
- Server-Sent Events for real-time updates
- Scheduler for automated crawls/audits

### Python AEO API
- **Port 8000**
- FastAPI framework
- AI-powered content analysis
- Integration with LLM providers

### Data Layer
- **SQLite** for crawler data
- **Redis** for queue management
- **File system** for audit results

## 🔄 Recent Changes

- ✅ Removed old HTML static pages (public/ folder)
- ✅ Consolidated to single React app (AEO Analyzer)
- ✅ Organized components into feature-based directories
- ✅ Cleaned up root directory structure
- ✅ Updated build configuration for single entry point
- ✅ Removed unnecessary files (old README, test data, stale builds)
- ✅ Cleaned dist/ folder for fresh builds
