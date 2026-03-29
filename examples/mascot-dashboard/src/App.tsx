import { useAISnitch } from './hooks/useAISnitch';
import { StatusBar } from './components/StatusBar';
import { Dashboard } from './components/Dashboard';
import { EventTicker } from './components/EventTicker';

export default function App() {
  const {
    agents,
    connectionStatus,
    welcome,
    recentEvents,
    totalKills,
    soundEnabled,
    toggleSound,
  } = useAISnitch();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <StatusBar
        connectionStatus={connectionStatus}
        welcome={welcome}
        agentCount={[...agents.values()].filter((a) => !a.isKilled).length}
        totalKills={totalKills}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
      />
      <Dashboard agents={agents} />
      <EventTicker events={recentEvents} />
    </div>
  );
}
