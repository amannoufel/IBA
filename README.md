# IBA

Next.js app with Supabase authentication and RLS-secure workflows for tenant complaints, worker assignments, reporting, and supervisor dashboards.

## Development

1. Install dependencies
2. Run the dev server
3. Configure Supabase environment variables as needed

## Auto-apply Supabase migrations

Migrations under `supabase/migrations/` are automatically applied to the remote Supabase project on every push to `main`.

Setup required once in your GitHub repository settings (Settings → Secrets and variables → Actions):

- Add repo secrets:
	- `SUPABASE_ACCESS_TOKEN`: A personal access token from Supabase (has access to the project).
	- `SUPABASE_PROJECT_REF`: Your Supabase project reference (e.g., `abcd1234`).

The GitHub Actions workflow at `.github/workflows/apply-supabase-migrations.yml` will link the project and run `supabase db push` when migration files change, or when triggered manually via "Run workflow".

