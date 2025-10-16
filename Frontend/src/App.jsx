import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import ImportsTable from './components/ImportsTable';
import Login from './components/Login';
import Trading from './components/Trading'; // <-- new trading component
import IssuerPortfolio from './pages/IssuerPortfolio';
import InvestorData from './pages/InvestorData'; // <-- new investor data page
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

        {/* Issuer Portfolio */}
        <Route
          path="/issuer-portfolio"
          element={
            <ProtectedRoute>
              <div>
                <Navigation />
                <IssuerPortfolio />
              </div>
            </ProtectedRoute>
          }
        />

        {/* Investor Data */}
        <Route
          path="/investor-data"
          element={
            <ProtectedRoute>
              <div>
                <Navigation />
                <InvestorData />
              </div>
            </ProtectedRoute>
          }
        />

      </Routes>
    </Router>
  );
}
