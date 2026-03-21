// Live Metrics Dashboard Component - YStack AI
// Tracking real-time user engagement for launch night

export default function LiveMetrics({ target = '/games/snakey' }) {
  const [activeUsers, setActiveUsers] = useState(0);
  
  useEffect(() => {
    // Fetch real-time metrics from telemetry stream
    const ws = new WebSocket('wss://telemetry.ystackai.com/stream');
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.event === 'player_join') {
        setActiveUsers(prev => prev + 1);
      }
    };
    return () => ws.close();
  }, [target]);

  return (
    <div className="metrics-widget">
      <h3>Active Players</h3>
      <span className="live-count">{activeUsers}</span>
      <div className="status-dot live"></div>
    </div>
  );
}