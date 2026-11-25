import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useGeolocation - wraps the browser Geolocation API
 */
export function useGeolocation({ enableHighAccuracy = true, timeout = 10000 } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const getOnce = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Could not detect location.');
        setLoading(false);
      },
      { enableHighAccuracy, timeout }
    );
  }, [enableHighAccuracy, timeout]);

  return { position, error, loading, getOnce };
}

/**
 * useGeolocationWatch - continuously watches device GPS position
 */
export function useGeolocationWatch({ enableHighAccuracy = true, maximumAge = 2000, timeout = 10000 } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef(null);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setWatching(true);
    setError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => {
        setError(err.message || 'GPS error.');
      },
      { enableHighAccuracy, maximumAge, timeout }
    );
  }, [enableHighAccuracy, maximumAge, timeout]);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { position, error, watching, start, stop };
}
