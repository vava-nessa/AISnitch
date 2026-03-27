/**
 * @file examples/mascot-consumer.ts
 * @description Example "mascot" consumer that converts AISnitch event types into simple avatar moods and gestures for downstream UI apps.
 * @functions
 *   → main
 *   → mapMascotState
 * @exports none
 * @see ./basic-consumer.ts
 * @see ../src/core/events/types.ts
 */

import WebSocket from 'ws';

interface MascotAction {
  readonly accent: string;
  readonly animation: string;
  readonly label: string;
}

/**
 * 📖 The point of AISnitch is not the TUI itself; it is the normalized stream.
 * A tiny mapping layer like this is enough for menu-bar pets, desktop widgets,
 * or playful dashboard overlays.
 */
function mapMascotState(eventType: string): MascotAction {
  switch (eventType) {
    case 'agent.thinking':
      return { accent: 'amber', animation: 'orbit', label: 'Thinking' };
    case 'agent.coding':
      return { accent: 'blue', animation: 'type', label: 'Coding' };
    case 'agent.tool_call':
      return { accent: 'teal', animation: 'inspect', label: 'Using tool' };
    case 'agent.asking_user':
      return { accent: 'pink', animation: 'wave', label: 'Needs input' };
    case 'agent.error':
      return { accent: 'red', animation: 'shake', label: 'Errored' };
    case 'task.complete':
      return { accent: 'green', animation: 'celebrate', label: 'Done' };
    default:
      return { accent: 'slate', animation: 'idle', label: 'Idle' };
  }
}

async function main(): Promise<void> {
  const socket = new WebSocket(process.env.AISNITCH_WS_URL ?? 'ws://127.0.0.1:4820');

  socket.on('message', (buffer) => {
    const payload = JSON.parse(buffer.toString('utf8')) as Record<string, unknown>;

    if (payload.type === 'welcome' || typeof payload.type !== 'string') {
      return;
    }

    const action = mapMascotState(payload.type);
    process.stdout.write(
      `[mascot] ${action.label} accent=${action.accent} animation=${action.animation} tool=${String(payload['aisnitch.tool'] ?? 'unknown')}\n`,
    );
  });
}

void main();

/*
Swift sketch for a native macOS consumer:

let action = mapMascotState(event.type)
mascotView.animation = action.animation
mascotView.accentColor = action.accentColor
statusItem.button?.title = action.label
*/
