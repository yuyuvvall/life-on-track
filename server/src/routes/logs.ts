import { Router } from 'express';
import { readLogs, clearLogs } from '../db/queryLogger.js';

const router = Router();

/**
 * @swagger
 * /logs/download:
 *   get:
 *     summary: Download and clear query logs
 *     tags: [Logs]
 *     description: Downloads the query log file as JSONL and clears it afterward
 *     responses:
 *       200:
 *         description: JSONL file download
 *         content:
 *           application/x-ndjson:
 *             schema:
 *               type: string
 *       500:
 *         description: Failed to download logs
 */
router.get('/download', (_req, res) => {
  try {
    const logs = readLogs();
    
    // Set headers for file download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `query-logs-${timestamp}.jsonl`;
    
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Send the file content
    res.send(logs);
    
    // Clear the logs after successful download
    clearLogs();
    
    console.log(`[Logs] Downloaded and cleared ${logs.split('\n').filter(l => l).length} log entries`);
  } catch (err) {
    console.error('[Logs] Error downloading logs:', (err as Error).message);
    res.status(500).json({ message: 'Failed to download logs' });
  }
});

/**
 * @swagger
 * /logs/stats:
 *   get:
 *     summary: Get aggregated log statistics
 *     tags: [Logs]
 *     responses:
 *       200:
 *         description: Aggregated statistics from query logs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogStats'
 *       500:
 *         description: Failed to get log stats
 */
router.get('/stats', (_req, res) => {
  try {
    const logs = readLogs();
    const lines = logs.split('\n').filter(l => l.trim());
    
    // Parse and aggregate stats
    const stats = {
      totalQueries: lines.length,
      byTable: {} as Record<string, number>,
      byQueryType: {} as Record<string, number>,
      byPurpose: {} as Record<string, number>,
      avgDurationMs: 0,
    };
    
    let totalDuration = 0;
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        
        // Count by table
        const table = entry.table || 'unknown';
        stats.byTable[table] = (stats.byTable[table] || 0) + 1;
        
        // Count by query type
        stats.byQueryType[entry.queryType] = (stats.byQueryType[entry.queryType] || 0) + 1;
        
        // Count by purpose
        stats.byPurpose[entry.purpose] = (stats.byPurpose[entry.purpose] || 0) + 1;
        
        // Sum duration
        totalDuration += entry.durationMs || 0;
      } catch {
        // Skip malformed lines
      }
    }
    
    stats.avgDurationMs = lines.length > 0 ? Math.round((totalDuration / lines.length) * 100) / 100 : 0;
    
    res.json(stats);
  } catch (err) {
    console.error('[Logs] Error getting stats:', (err as Error).message);
    res.status(500).json({ message: 'Failed to get log stats' });
  }
});

export default router;

