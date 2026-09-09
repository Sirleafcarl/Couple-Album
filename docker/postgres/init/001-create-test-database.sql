SELECT 'CREATE DATABASE memory_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'memory_test')\gexec
