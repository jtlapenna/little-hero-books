import type { IncomingMessage, ServerResponse } from 'node:http';
import { relay } from '../../lib/relay.js';

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return relay('health-monitor', req, res);
}
