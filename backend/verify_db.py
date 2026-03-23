
from middleware.auth import verify_password
import sqlite3

def check():
    conn = sqlite3.connect('support.db')
    cursor = conn.cursor()
    cursor.execute('SELECT password_hash FROM agents WHERE email=?', ('admin@example.com',))
    row = cursor.fetchone()
    if not row:
        print("Admin not found")
        return
    hashed = row[0]
    print(f"Hashed: {hashed}")
    result = verify_password("admin123", hashed)
    print(f"Verify result: {result}")
    conn.close()

if __name__ == "__main__":
    check()
