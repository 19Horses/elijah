import { useEffect, useState } from 'react';
import { useCollections } from '../queries/collection';
import {
  clearCollectionTimer,
  DEBUG_TIMERS_EVENT,
  getExpiryOverride,
  resetCollectionTimer,
} from '../services/debugTimers';

function DebugPanel() {
  const { data: collections } = useCollections();
  const [open, setOpen] = useState(false);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const sync = () => forceRender((n) => n + 1);
    window.addEventListener(DEBUG_TIMERS_EVENT, sync);
    return () => window.removeEventListener(DEBUG_TIMERS_EVENT, sync);
  }, []);

  const items = collections ?? [];

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
        </div>
      )}
    </div>
  );
}

export default DebugPanel;
