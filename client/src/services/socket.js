import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || '';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    const opts = {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    };
    socket = WS_URL ? io(WS_URL, opts) : io(opts);

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️  WebSocket connect error:', err.message);
    });
  }
  return socket;
};

export const subscribeToJob = (pythonJobId, onProgress) => {
  const s = getSocket();
  const room = `job:${pythonJobId}`;

  s.emit('subscribe_job', pythonJobId);

  const handler = (event) => onProgress(event);
  s.on('progress', handler);

  // Return cleanup function
  return () => {
    s.emit('unsubscribe_job', pythonJobId);
    s.off('progress', handler);
  };
};

export default getSocket;
