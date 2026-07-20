import os
import sqlite3
import requests
import json
import re
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Configurable so the Docker containers can point at the right places.
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "data" / "universe.db"))
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

def search_repository(repo_name):
    """Search for a repository by name (case-insensitive partial match)"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # Use LIKE with wildcards for partial name matching
        cursor.execute(
            """
            SELECT id, full_name, owner, name, description, language,
                   github_stars, github_forks, open_issues, watchers,
                   created_at, pushed_at, is_archived, is_fork,
                   habitability_score, star_type, trending_count,
                   homepage, license, topics
            FROM repositories
            WHERE (name LIKE ? OR full_name LIKE ?)
              AND enrichment_failed = 0
            LIMIT 1
            """,
            (f"%{repo_name}%", f"%{repo_name}%")
        )
        result = cursor.fetchone()
        conn.close()
        return dict(result) if result else None
    except Exception as e:
        print(f"Error searching repository: {e}")
        return None

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    message = data.get("message", "")

    # Step 1: Use LLM to extract repo name and field from the message
    extraction_prompt = f"""You are a helpful assistant that extracts information from user queries about GitHub repositories.

From the following user message, extract:
1. The repository name (could be full name like "owner/repo" or just the repo name)
2. The field/metric they're asking about (e.g., stars, forks, issues, activity, language, etc.)

Return a JSON object with ONLY these two fields: "repo_name" and "field"
Do not include any other text, explanations, or markdown. Just the raw JSON.

User message: "{message}"
JSON:"""

    try:
        # Get extraction from LLM
        extraction_response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": "llama3.2:1b", "prompt": extraction_prompt, "stream": False}
        )
        extraction_text = extraction_response.json().get("response", "").strip()
        print("LLM extraction response:", extraction_text)

        # Parse the JSON response
        try:
            # Try to extract JSON from the response (in case there's extra text)
            json_match = re.search(r'\{[^}]+\}', extraction_text)
            if json_match:
                extraction_data = json.loads(json_match.group())
            else:
                extraction_data = json.loads(extraction_text)
        except json.JSONDecodeError:
            extraction_data = {"repo_name": "", "field": ""}

        repo_name = extraction_data.get("repo_name", "").strip()
        field = extraction_data.get("field", "").strip().lower()

        print(f"Extracted repo_name: {repo_name}, field: {field}")

        # Step 2: Search for the repository in the database
        if not repo_name:
            return jsonify({"reply": "I couldn't identify a repository name in your message. Please specify a repo name like 'netdata' or 'owner/repo'."})

        repo = search_repository(repo_name)

        if not repo:
            return jsonify({"reply": f"Repository '{repo_name}' not found in the database. Try searching with a different name."})

        # Step 3: Extract the requested field and format the response
        field_mapping = {
            "stars": ("github_stars", "stars"),
            "forks": ("github_forks", "forks"),
            "issues": ("open_issues", "open issues"),
            "watchers": ("watchers", "watchers"),
            "activity": ("habitability_score", "activity score"),
            "language": ("language", "programming language"),
            "created": ("created_at", "creation date"),
            "pushed": ("pushed_at", "last push date"),
            "archived": ("is_archived", "archived status"),
            "fork": ("is_fork", "fork status"),
            "type": ("star_type", "star type"),
            "trending": ("trending_count", "trending count"),
            "habitability": ("habitability_score", "habitability score"),
        }

        # Try to find matching field
        field_key = None
        field_display = None
        for key, (db_field, display) in field_mapping.items():
            if key in field or field in key:
                field_key = db_field
                field_display = display
                break

        # If no specific field matched, provide a general summary
        if not field_key:
            response_text = f"""Repository: {repo['full_name']}
Language: {repo['language'] or 'N/A'}
Stars: ⭐ {repo['github_stars']}
Forks: 🍴 {repo['github_forks']}
Open Issues: 📋 {repo['open_issues']}
Activity Score: {round(repo['habitability_score'] * 100, 1)}%
Status: {'🌱 Habitable (actively maintained)' if repo['habitability_score'] > 0.5 else '🪐 Stale'}"""
            return jsonify({"reply": response_text})

        # Return the specific field
        value = repo.get(field_key)
        
        # Format the value based on the field type
        if isinstance(value, bool):
            formatted_value = "Yes" if value else "No"
        elif field_key == "habitability_score":
            formatted_value = f"{round(value * 100, 1)}%" if value else "Unknown"
        else:
            formatted_value = str(value) if value is not None else "Unknown"

        reply = f"The {field_display} of {repo['full_name']} is: {formatted_value}"
        return jsonify({"reply": reply})

    except Exception as e:
        print(f"Error in chat: {e}")
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500


@app.route("/narrate", methods=["POST"])
def narrate():
    data = request.get_json()
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "missing prompt"}), 400

    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": "llama3.2:1b", "prompt": prompt, "stream": False},
        )
        body = response.json()
        if body.get("error"):
            return jsonify({"error": body["error"]}), 502
        reply = body.get("response", "").strip()
        if not reply:
            return jsonify({"error": "Ollama returned an empty response"}), 502
        return jsonify({"reply": reply})
    except Exception as e:
        print(e)
        return jsonify({"error": "Failed to contact Ollama"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "3000")))