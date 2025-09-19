# React Web Crawler Frontend

This project now has a React frontend alongside the existing Node.js backend.

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
│   ├── frontend/          # React frontend
│   │   ├── App.tsx       # Main React component
│   │   ├── App.css       # Styles
│   │   └── main.tsx      # React entry point
│   ├── crawler.ts        # Backend crawler logic
│   ├── server.ts         # Express server
│   └── ...
├── public/               # Old HTML files (can be removed)
├── index.html           # React app template
├── vite.config.ts       # Vite configuration
└── package.json
```

## 🎯 Features

### React Frontend
- ✅ **Modern UI** with React hooks
- ✅ **Real-time updates** via Server-Sent Events
- ✅ **Resume functionality** with queue management
- ✅ **Export capabilities** (JSON, CSV, TXT, XML)
- ✅ **Queue status checking**
- ✅ **Responsive design**

### Backend (Unchanged)
- ✅ **Crawlee crawlers** (Cheerio + Playwright)
- ✅ **Express API** with monitoring
- ✅ **Server-Sent Events** for real-time updates
- ✅ **Resume functionality** with queue preservation

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
- **Monitoring**: http://localhost:3004/monitoring.html (old UI)

## 🔄 Migration Notes

- Old HTML files in `public/` can be removed
- React app replaces the old `index.html`
- All backend functionality remains unchanged
- API endpoints are the same
