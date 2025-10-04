import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import ImportsTable from './components/ImportsTable';
import Login from './components/Login';
import Portfolio from './components/Portfolio'; // <-- new
import Trading from './components/Trading'; // <-- new trading component
import Navigation from './components/Navigation'; // <-- new navigation
import './App.css';

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('token') === 'authenticated';
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* everything inside here is protected */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>
                <Navigation />
                <main><ImportsTable /></main>
              </div>
            </ProtectedRoute>
          }
        />

        {/* Trading Dashboard */}
        <Route
          path="/trading"
          element={
            <ProtectedRoute>
              <div>
                <Navigation />
                <Trading />
              </div>
            </ProtectedRoute>
          }
        />

        {/* NEW: protected user route like /shivam, /bhumit */}
        <Route
          path="/:username"
          element={
            <ProtectedRoute>
              <div>
                <Navigation />
                <Portfolio />
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}
