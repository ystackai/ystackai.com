// Dashboard Metrics Collector Stub
export const METRICS_CONFIG = {
  endpoint: '/api/v1/telemetry',
  bufferTime: 5000,
  batchSize: 50
};

export async function collectMetrics(data) {
  // placeholder for day 1 tracking
  console.log('[metrics] collecting:', data.type);
}
