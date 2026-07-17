import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollections } from '../queries/collection';
import {
  clearCollectionTimer,
  DEBUG_TIMERS_EVENT,
  getExpiryOverride,
  resetCollectionTimer,
} from '../services/debugTimers';
import { logout } from '../services/logout';
import { resetUserSession } from '../services/resetUserSession';
import { getStoredUser } from '../services/userStorage';

function DebugPanel() {
  const { data: collections } = useCollections();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const sync = () => forceRender((n) => n + 1);
    window.addEventListener(DEBUG_TIMERS_EVENT, sync);
    return () => window.removeEventListener(DEBUG_TIMERS_EVENT, sync);
  }, []);

  const items = collections ?? [];
  const loggedIn = Boolean(getStoredUser());

  const handleReset = () => {
    if (
      !window.confirm(
        'Reset test user? This deletes your Firebase user and clears local storage.'
      )
    ) {
      return;
    }

    setResetting(true);
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
        setResetting(false);
      });
  };

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate('/', { replace: true });
  };

  return (
    <div className="debug-panel">
      <button
        type="button"
        className="debug-panel__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        Debug {open ? '▾' : '▸'}
      </button>

      {open && (
        <div className="debug-panel__body">
          <p className="debug-panel__heading">Collection timers</p>
          {items.length === 0 ? (
            <p className="debug-panel__empty">No active collections.</p>
          ) : (
            items.map((collection) => {
              const overridden = getExpiryOverride(collection._id) !== null;
              return (
                <label key={collection._id} className="debug-panel__row">
                  <input
                    type="checkbox"
                    checked={overridden}
                    onChange={(e) => {
                      if (e.target.checked) {
                        resetCollectionTimer(collection);
                      } else {
                        clearCollectionTimer(collection);
                      }
                    }}
                  />
                  <span className="debug-panel__row-label">
                    {collection.name}
                    <span className="debug-panel__row-hint">
                      {overridden ? 'timer reset' : 'reset to 0'}
                    </span>
                  </span>
                </label>
              );
            })
          )}

          <p className="debug-panel__heading debug-panel__heading--spaced">
            Session
          </p>
          <div className="debug-panel__actions">
            <button
              type="button"
              className="debug-panel__action"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? 'Resetting…' : 'Reset user (test)'}
            </button>
            {loggedIn && (
              <button
                type="button"
                className="debug-panel__action"
                onClick={handleLogout}
              >
                Log out
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DebugPanel;
