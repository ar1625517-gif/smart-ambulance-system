import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../services/api.js';

/**
 * useSocket - manages a Socket.IO connection with auth token
 * @param {string|null} token  - Bearer token for socket auth
 * @param {object} opts
 * @param {boolean} opts.autoConnect  - connect immediately (default true)
 * @param {string[]} opts.rooms       - rooms to join on connect
 */
export function useSocket(token, { autoConnect = true, rooms = [] } = {}) {
  const socketRef = useRef(null);
  const [socketInstance, setSocketInstance] = useState(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('disconnected'); // connecting | connected | disconnected | reconnecting

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    const s = io(API_BASE, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined
    });

    socketRef.current = s;
    setSocketInstance(s);
    setStatus('connecting');

    s.on('connect', () => {
      setConnected(true);
      setStatus('connected');
      rooms.forEach((room) => s.emit(room));
    });

    s.on('disconnect', () => {
      setConnected(false);
      setStatus('disconnected');
    });

    s.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    s.io.on('reconnect', () => setStatus('connected'));

    return s;
  }, [token, rooms]);

  useEffect(() => {
    if (!autoConnect) return;
    const s = connect();
    return () => {
      s?.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, token]);

  const emit = useCallback((event, payload) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  return { socket: socketInstance, connected, status, emit, on, connect };
}

/**
 * useControlRoomSocket - socket that joins control_room and receives notifications
 */
export function useControlRoomSocket(token, onNotification) {
  const { socket, status } = useSocket(token, {
    autoConnect: true,
    rooms: ['join_control_room']
  });

  useEffect(() => {
    if (!socket) return;
    const handler = (notification) => onNotification?.(notification);
    socket.on('emergency_notification', handler);
    return () => socket.off('emergency_notification', handler);
  }, [socket, onNotification]);

  return { status };
}

/**
 * useTripSocket - socket that joins a trip room and listens for location updates
 */
export function useTripSocket(token, tripId, onLocation) {
  const { socket, status } = useSocket(token, {
    autoConnect: !!tripId,
    rooms: []
  });

  useEffect(() => {
    if (!socket || !tripId) return;
    socket.emit('join_trip', tripId);
    const handler = (payload) => onLocation?.(payload);
    socket.on('live_location', handler);
    return () => socket.off('live_location', handler);
  }, [socket, tripId, onLocation]);

  return { status };
}
