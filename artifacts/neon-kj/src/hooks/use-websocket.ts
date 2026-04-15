import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import type { QueueState, QueueItem } from '@workspace/api-client-react';
import { useToast } from './use-toast';

interface WsState {
  connected: boolean;
  queueState: QueueState | null;
}

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws`;

// #9: Only show the "Now On Stage" toast on the singer page
function isSingerPage(): boolean {
  return window.location.pathname.includes('/singer');
}

export function useWebSocketEngine() {
  const [state, setState] = useState<WsState>({
    connected: false,
    queueState: null,
  });
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('[WS] Connecting to', WS_URL);
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[WS] Connected');
      setState(s => ({ ...s, connected: true }));
      fetch('/api/shows/current')
        .then(res => res.json())
        .then(data => {
          setState(s => ({ ...s, queueState: data }));
        })
        .catch(console.error);
    };

    ws.onmessage = (event) => {
      try {
        const { event: type, data } = JSON.parse(event.data);
        console.log('[WS] Message:', type);
        
        switch (type) {
          case 'queue_update':
            setState(s => ({ ...s, queueState: data as QueueState }));
            break;

          case 'now_playing':
            // #9: Only toast on the singer page — the host UI already shows this visually
            if (isSingerPage()) {
              const np = data as QueueItem;
              toast({
                title: "🎤 Now On Stage!",
                description: `${np.singerName} is singing ${np.songTitle}`,
                className: "border-primary bg-background/95 backdrop-blur shadow-glow-primary",
              });
            }
            break;

          case 'singer_called':
            break;

          case 'low_energy_alert':
            break;

          case 'show_started':
            toast({
              title: "✨ Show Started!",
              description: "The karaoke rotation is now active.",
              className: "border-secondary bg-background/95 backdrop-blur shadow-glow-secondary",
            });
            // #2: Clear stored singer identity so returning singers don't bleed into the new show
            localStorage.removeItem('neon_kj_singer_id');
            localStorage.removeItem('neon_kj_singer_name');
            fetch('/api/shows/current').then(r => r.json()).then(d => setState(s => ({ ...s, queueState: d })));
            break;

          case 'show_ended':
            toast({
              title: "👋 Show Ended",
              description: "Thanks for a great night!",
            });
            // Clear singer identity when show ends too
            localStorage.removeItem('neon_kj_singer_id');
            localStorage.removeItem('neon_kj_singer_name');
            setState(s => ({ ...s, queueState: null }));
            break;
        }
      } catch (err) {
        console.error('[WS] Failed to parse message', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 3s...');
      setState(s => ({ ...s, connected: false }));
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    wsRef.current = ws;
  }, [toast]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return state;
}

// Global Context so any component can tap into the live state
const WsContext = createContext<WsState>({ connected: false, queueState: null });

export const WsProvider = WsContext.Provider;
export const useLiveQueue = () => useContext(WsContext);
