import type { MascotState, ToolName, AISnitchEventType } from '@aisnitch/client';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export interface ActivityInfo {
  readonly verb: string;
  readonly emoji: string;
  readonly detail?: string;
}

export interface AgentCardState {
  readonly sessionId: string;
  readonly tool: ToolName;
  readonly project?: string;
  readonly projectPath?: string;
  readonly terminal?: string;
  readonly model?: string;
  readonly cwd?: string;
  readonly mascotState: MascotState;
  readonly lastDescription: string;
  readonly lastEventType: AISnitchEventType;
  readonly activity: ActivityInfo;
  readonly eventCount: number;
  readonly startedAt: string;
  readonly lastEventAt: number;
  readonly isSleeping: boolean;
  readonly isKilled: boolean;
  readonly killedAt?: number;
}

export interface TickerEvent {
  readonly tool: ToolName;
  readonly text: string;
  readonly timestamp: number;
}
