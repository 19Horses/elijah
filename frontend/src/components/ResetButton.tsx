import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetUserSession } from '../services/resetUserSession';

function ResetButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleReset = () => {
    if (
      !window.confirm(
        'Reset test user? This deletes your Firebase user and clears local storage.'
      )
    ) {
      return;
    }

    setLoading(true);
    void resetUserSession()
      .then(() => {
        queryClient.clear();
        navigate('/', { replace: true });
      })
      .catch((error) => {
        console.error('Failed to reset user session', error);
        window.alert('Reset failed. Check the console for details.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <button
      type="button"
      className="reset-button"
      onClick={handleReset}
      disabled={loading}
    >
      {loading ? 'Resetting…' : 'Reset user (test)'}
    </button>
  );
}

export default ResetButton;
