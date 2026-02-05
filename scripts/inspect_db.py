import psycopg2
from psycopg2.extras import RealDictCursor

def inspect_db():
    try:
        conn = psycopg2.connect(
            host='localhost',
            port=5433,
            user='learnfast',
            password='password',
            dbname='learnfast',
            cursor_factory=RealDictCursor
        )
        cursor = conn.cursor()
        
        print("Checking tables in 'public' schema:")
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        tables = cursor.fetchall()
        for r in tables:
            print(f" - {r['table_name']}")
            
        print("\nChecking extensions:")
        cursor.execute("SELECT extname FROM pg_extension")
        extensions = cursor.fetchall()
        for r in extensions:
            print(f" - {r['extname']}")
            
        if any(r['table_name'] == 'documents' for r in tables):
            print("\nColumns in 'documents' table:")
            cursor.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'documents'")
            cols = cursor.fetchall()
            for r in cols:
                print(f" - {r['column_name']} ({r['data_type']})")
        else:
            print("\n'documents' table does NOT exist in 'public' schema.")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    inspect_db()
