import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import path from 'node:path';
let input = '', bytes = 0;
process.stdin.setEncoding('utf8');
process.stdin.on('data', part => {
  bytes += Buffer.byteLength(part);
  if (bytes > 8192) process.exit(1);
  input += part;
});
process.stdin.on('end', () => {
  let db;
  try {
    const { file, since, cursor, cursorId } = JSON.parse(input);
    if (typeof file !== 'string' || !path.isAbsolute(file) || !Number.isFinite(since) || !Number.isFinite(cursor) || typeof cursorId !== 'string' || cursorId.length > 512) throw Error();
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error();
    db = new DatabaseSync(file, { readOnly: true });
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=500; PRAGMA cache_size=-1024; PRAGMA temp_store=FILE; PRAGMA hard_heap_limit=33554432;');
    const rows = db.prepare(`SELECT m.id,m.time_updated AS updated,substr(s.directory,1,4096) AS directory,
      substr(json_extract(m.data,'$.modelID'),1,160) AS model,
      json_extract(m.data,'$.tokens.input') AS inputTokens,
      json_extract(m.data,'$.tokens.output') AS outputTokens,
      json_extract(m.data,'$.tokens.reasoning') AS reasoningTokens,
      json_extract(m.data,'$.tokens.cache.read') AS cacheRead,
      json_extract(m.data,'$.tokens.cache.write') AS cacheWrite,
      json_extract(m.data,'$.cost') AS cost,
      COALESCE(json_extract(m.data,'$.time.completed'),m.time_created) AS completed
      FROM message m JOIN session s ON s.id=m.session_id
      WHERE m.time_updated>=? AND (m.time_updated>? OR (m.time_updated=? AND m.id>?))
      AND json_extract(m.data,'$.role')='assistant'
      ORDER BY m.time_updated,m.id LIMIT 1000`).all(since, cursor, cursor, cursorId);
    const result = JSON.stringify({ rows });
    if (Buffer.byteLength(result) > 2 * 1024 * 1024) throw Error();
    process.stdout.write(result);
  } catch { process.exitCode = 1; }
  finally { db?.close(); }
});
