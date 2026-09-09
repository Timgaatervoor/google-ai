import { useState, useEffect } from 'react';
import { syncService } from '../services/syncService';

export function useOnlineStatus() {
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(
    syncService.getIsSimulatedOffline()
  );

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsub = syncService.subscribe(() => {
      setIsSimulatedOffline(syncService.getIsSimulatedOffline());
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsub();
    };
  }, []);

  const isEffectiveOnline = isBrowserOnline && !isSimulatedOffline;

  const toggleSimulatedOffline = () => {
    syncService.setSimulatedOffline(!isSimulatedOffline);
  };

  return {
    isOnline: isEffectiveOnline,
    isBrowserOnline,
    isSimulatedOffline,
    toggleSimulatedOffline,
  };
}
