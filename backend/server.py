import sqlite3
import requests
import re
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_PATH = "data/universe.db"

def get_db_schema():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()

    schema = ""
    for (table_name,) in tables:
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = cursor.fetchall()
        col_names = [col[1] for col in columns]
        cursor.execute(f"SELECT * FROM {table_name} LIMIT 2;")
        samples = cursor.fetchall()
        schema += f"Table: {table_name}\nColumns: {', '.join(col_names)}\nSample rows: {samples}\n\n"

    conn.close()
    return schema

def run_sql(query):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(query)
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows, None
    except Exception as e:
        return None, str(e)

db_schema = get_db_schema()
print("Database schema loaded:\n", db_schema)

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    message = data.get("message", "")

    sql_prompt = f"""You are a SQL expert working with a SQLite database. Write a SQL query to answer the question.
    Return ONLY the raw SQL query. No explanations, no markdown, no backticks, no code fences.
    
    IMPORTANT RULES:
    - Always use LIKE with % wildcards for name searches, never exact match
    - Example: WHERE name LIKE '%TrendRadar%' not WHERE name = 'TrendRadar'
    - Use LOWER() for case insensitive search: WHERE LOWER(name) LIKE LOWER('%trendradar%')
    
Schema:
{db_schema}
    
Question: {message}
SQL:"""

    try:
        # Step 1: Generate SQL with gemma2:9b-coder
        sql_response = requests.post(
            "http://localhost:11434/api/generate",
            json={"model": "gemma2:9b", "prompt": sql_prompt, "stream": False}
        )
        sql_query = sql_response.json().get("response", "").strip()
        print("Generated SQL:", sql_query)

        # Step 2: Run the SQL
        rows, error = run_sql(sql_query)

        if error:
            print("SQL Error:", error)
            context = f"SQL error: {error}"
        elif not rows:
            context = "No results found."
        else:
            context = str(rows)

        print("Query results:", context)

        # Step 3: Answer naturally with gemma2:9b
        answer_prompt = f"""Answer the user's question using ONLY the data provided below.
Do not say you lack access to databases. The data has already been retrieved for you.
Give a short, direct answer in one or two sentences.

Data: {context}

Question: {message}
Answer:"""

        answer_response = requests.post(
            "http://localhost:11434/api/generate",
            json={"model": "gemma2:9b", "prompt": answer_prompt, "stream": False}
        )

        reply = answer_response.json().get("response", "No response from model")
        return jsonify({"reply": reply})

    except Exception as e:
        print(e)
        return jsonify({"error": "Failed to contact Ollama"}), 500

if __name__ == "__main__":
    app.run(port=3000, debug=True)