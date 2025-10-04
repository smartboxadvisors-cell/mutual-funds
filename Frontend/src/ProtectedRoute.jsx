import { Navigate, Outlet } from 'react-router-dom';
import { isAuthed } from './auth';

const ProtectedRoute = () => {
  return isAuthed() ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
