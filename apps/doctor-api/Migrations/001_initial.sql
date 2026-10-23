CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS clinic_users (
 id text PRIMARY KEY,
 clinic_id text NOT NULL,
 email text NOT NULL UNIQUE,
 name text NOT NULL,
 specialty text NOT NULL CHECK(specialty IN ('psychiatrist','physician','patient')),
 password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 security_version integer NOT NULL DEFAULT 1,
 patient_id text NULL
);
CREATE TABLE IF NOT EXISTS patient_records (
 id text PRIMARY KEY,
 clinic_id text NOT NULL,
 doctor_id text NOT NULL REFERENCES clinic_users(id),
 revision integer NOT NULL CHECK(revision>=0),
 document jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS care_relationships (
 patient_id text NOT NULL REFERENCES patient_records(id),
 doctor_id text NOT NULL REFERENCES clinic_users(id),
 clinic_id text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(patient_id,doctor_id)
);
CREATE INDEX IF NOT EXISTS care_doctor_clinic ON care_relationships(doctor_id,clinic_id) WHERE active;
CREATE TABLE IF NOT EXISTS record_versions (
 patient_id text NOT NULL REFERENCES patient_records(id),
 revision integer NOT NULL,
 document jsonb NOT NULL,
 actor_id text NOT NULL,
 saved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(patient_id,revision)
);
CREATE TABLE IF NOT EXISTS command_receipts (
 patient_id text NOT NULL REFERENCES patient_records(id),
 command_id text NOT NULL,
 actor_id text NOT NULL,
 payload_hash text NOT NULL,
 revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(patient_id,command_id)
);
CREATE TABLE IF NOT EXISTS access_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id text NOT NULL,
 clinic_id text NOT NULL,
 patient_id text,
 action text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creation_receipts (
 patient_id text PRIMARY KEY REFERENCES patient_records(id),
 actor_id text NOT NULL,
 clinic_id text NOT NULL,
 payload_hash text NOT NULL
);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
