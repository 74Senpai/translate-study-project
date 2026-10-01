import os
import sys
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from backend/.env
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# You need to add SUPABASE_DB_URL to your .env
# Example: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
DB_URL = os.getenv("SUPABASE_DB_URL")

def migrate():
    if not DB_URL:
        print("Error: SUPABASE_DB_URL not found in .env")
        print("Please add your PostgreSQL connection string to .env")
        sys.exit(1)

    migrations_dir = Path(__file__).parent.parent / "migrations"
    migrations_dir.mkdir(exist_ok=True)

    try:
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = True
        cur = conn.cursor()

        # 1. Create history table if not exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public._migrations_history (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # 2. Get applied migrations
        cur.execute("SELECT name FROM public._migrations_history")
        applied = {row[0] for row in cur.fetchall()}

        # 3. Find and sort migration files
        migration_files = sorted(migrations_dir.glob("*.sql"))

        for sql_file in migration_files:
            if sql_file.name in applied:
                continue

            print(f"Applying migration: {sql_file.name}...")
            with open(sql_file, "r", encoding="utf-8") as f:
                sql = f.read()
                
            try:
                cur.execute(sql)
                cur.execute("INSERT INTO public._migrations_history (name) VALUES (%s)", (sql_file.name,))
                print(f"Successfully applied {sql_file.name}")
            except Exception as e:
                print(f"Error applying {sql_file.name}: {e}")
                sys.exit(1)

        print("All migrations are up to date.")
        cur.close()
        conn.close()

    except Exception as e:
        print(f"Database connection error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
