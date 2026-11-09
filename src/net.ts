// Live-hall connection with automatic reconnect. The app works fine offline; this only adds presence.
import { wsUrl } from './api';

export type Msg = { t: string; [k: string]: unknown };

export class Net {
  online = false;
  room = 'main';
  onMessage: (m: Msg) => void = () => {};
  onStatus: (online: boolean) => void = () => {};
  hello: () => Record<string, unknown> = () => ({});

  private ws: WebSocket | null = null;
  private retry = 0;
  private timer = 0;
  private ping = 0;

  connect() {
    clearTimeout(this.timer);
    if (this.ws) return;
    const url = wsUrl(this.room);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.online = true;
      this.retry = 0;
      this.send({ t: 'hello', ...this.hello() });
      this.onStatus(true);
      clearInterval(this.ping);
      this.ping = window.setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      try {
        this.onMessage(JSON.parse(e.data));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      clearInterval(this.ping);
      this.ws = null;
      this.online = false;
      this.onStatus(false);
      this.schedule();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private schedule() {
    clearTimeout(this.timer);
    const d = Math.min(15000, 1000 * 2 ** this.retry++);
    this.timer = window.setTimeout(() => this.connect(), d);
  }

  /** Reconnect right away (e.g. when the phone screen turns back on). */
  wake() {
    if (!this.ws) {
      this.retry = 0;
      this.connect();
    }
  }

  /** Move to another hall room (e.g. the Seeker-only hall). */
  setRoom(room: string) {
    if (room === this.room) return;
    this.room = room;
    const ws = this.ws;
    if (ws) {
      ws.onclose = null;
      clearInterval(this.ping);
      this.ws = null;
      this.online = false;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    this.retry = 0;
    this.connect();
  }

  send(m: Record<string, unknown>) {
    if (this.ws && this.online) this.ws.send(JSON.stringify(m));
  }
}
