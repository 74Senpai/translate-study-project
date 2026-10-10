import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import AdminErrorBoundary from './components/AdminErrorBoundary.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <AdminErrorBoundary>
          <App />
        </AdminErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
