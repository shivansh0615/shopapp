# Archived SQLite migration history (pre–Phase 1 PostgreSQL baseline).
#
# These migrations were written for provider = "sqlite" and must NOT be applied
# to PostgreSQL. They are retained for historical reference only.
#
# The active migration chain starts at:
#   prisma/migrations/20260730120000_postgres_baseline
#
# Existing prisma/dev.sqlite was not deleted. `prisma migrate deploy` does not
# copy SQLite data into Postgres.
