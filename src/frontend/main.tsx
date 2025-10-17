import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './App.css'
import AppWithAuth from './AppWithAuth'
import { AuthProvider } from './contexts/AuthContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  </React.StrictMode>,
)
