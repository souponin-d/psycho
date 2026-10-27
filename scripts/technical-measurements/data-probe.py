"""VPS PostgreSQL growth probe using temporary synthetic tables, not production records."""
import json
import argparse
import subprocess
import time


def query(statement):
    started = time.perf_counter()
    result = subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-XqAt", "-v",
        "ON_ERROR_STOP=1", "-d", "syncli_hackathon", "-c", statement], capture_output=True, text=True)
    if result.returncode:
        # PostgreSQL ERROR line only: do not publish row values or statement context.
        reason = next((line for line in result.stderr.splitlines() if "ERROR:" in line), "unknown SQL error")
        raise RuntimeError("Temporary SQL probe failed: " + reason)
    return result.stdout.strip(), time.perf_counter() - started


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--sizes", default="100,1000,10000")
args = parser.parse_args()
sizes = [int(value) for value in args.sizes.split(",")]
if any(value < 1 or value > 10000 for value in sizes):
    raise ValueError("Sizes must be between 1 and 10000")
results = []
for count in sizes:
    setup = f"""
    BEGIN;
    SET LOCAL statement_timeout='60s';
    CREATE TEMP TABLE measure58_records (LIKE patient_records INCLUDING INDEXES) ON COMMIT DROP;
    CREATE TEMP TABLE measure58_care (LIKE care_relationships INCLUDING INDEXES) ON COMMIT DROP;
    INSERT INTO measure58_records
    SELECT 'measure58-'||g,'measure58-clinic','measure58-doctor',0,
      jsonb_set(jsonb_set(p.document,'{{id}}',to_jsonb('measure58-'||g)),
      '{{profile,name}}',to_jsonb('Синтетический замер 58 '||g)), now() - g*interval '1 minute'
    FROM generate_series(1,{count}) g CROSS JOIN
      (SELECT document FROM patient_records WHERE document->'profile'->>'name' ILIKE '%синтетическ%' LIMIT 1) p;
    INSERT INTO measure58_care SELECT id,doctor_id,clinic_id,true FROM measure58_records;
    ANALYZE measure58_records; ANALYZE measure58_care;
    SELECT json_build_object('count',count(*),'table_bytes',pg_total_relation_size('measure58_records'),
      'document_bytes',sum(octet_length(document::text))) FROM measure58_records;
    """
    queries = {
        "list_sql_same_shape_as_store": "SELECT p.document FROM measure58_records p JOIN measure58_care c ON c.patient_id=p.id AND c.clinic_id=p.clinic_id WHERE c.doctor_id='measure58-doctor' AND c.clinic_id='measure58-clinic' AND c.active ORDER BY p.updated_at DESC",
        "point_lookup": "SELECT document FROM measure58_records WHERE id='measure58-50'",
        "profile_search": "SELECT document FROM measure58_records WHERE document->'profile'->>'name' ILIKE '%58 50%'",
        "period_filter": "SELECT document FROM measure58_records WHERE updated_at > now()-interval '7 days' ORDER BY updated_at DESC LIMIT 50",
    }
    # EXPLAIN ANALYZE executes SQL but does not serialize/transfer a clinical JSON response to the client.
    sql = setup + ";".join("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + text for text in queries.values()) + ";ROLLBACK;"
    try:
        raw, elapsed = query(sql)
    except RuntimeError as error:
        results.append({"count": count, "failed": True, "reason": str(error)})
        break
    decoder = json.JSONDecoder()
    objects = []
    while raw.strip():
        obj, end = decoder.raw_decode(raw.lstrip())
        objects.append(obj)
        raw = raw.lstrip()[end:]
    metadata, plans = objects[0], objects[1:]
    if metadata["count"] != count:
        raise RuntimeError("No valid synthetic template")
    results.append({**metadata, "trial_seconds": elapsed,
        "queries": {name: {"execution_ms": plan[0]["Execution Time"],
            "planning_ms": plan[0]["Planning Time"], "plan": plan[0]["Plan"]}
            for name, plan in zip(queries, plans)}})
print(json.dumps({"scope": "Temporary cloned JSONB records; SQL execution only, no API/UI serialization",
    "source_records_modified": False, "trials_per_size": 1, "results": results}))
