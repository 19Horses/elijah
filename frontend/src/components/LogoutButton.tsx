import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/logout';
import { getStoredUser } from '../services/userStorage';

function LogoutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!getStoredUser()) {
    return null;
  }

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate('/', { replace: true });
  };

  return (
    <button type="button" className="logout-button" onClick={handleLogout}>
      Log out
    </button>
  );
}

export default LogoutButton;
