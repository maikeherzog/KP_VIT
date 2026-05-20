const fs = require('fs');
const csvParser = require('csv-parser');
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

let csvRows = [];
fs.createReadStream("src/backend/github_top_projects.csv")
    .pipe(csvParser())
    .on("data", (row) => csvRows.push(row))
    .on("end", () => console.log(`Loaded ${csvRows.length} rows`));

// 2. Simple keyword search
function findRelevantRows(question, maxRows = 10) {
    const keywords = question.toLowerCase().split(" ");
    return csvRows
        .filter(row =>
            keywords.some(kw =>
                Object.values(row).some(val =>
                    String(val).toLowerCase().includes(kw)
                )
            )
        )
        .slice(0, maxRows);
}

app.post("/chat", async (req, res) => {
        const {message} = req.body;

        const relevantRows = findRelevantRows(message);
        const context = relevantRows.length > 0
            ? JSON.stringify(relevantRows, null, 2)
            : "No matching data found.";

        const prompt = `You are a helpful data assistant. The user may send you general questions and may ask about specific rows from our dataset. If he asked a general question, answer him normally. If he asked about our data, use the data below to answer the question.
        
        Data:
        ${context}
        
        Question: ${message}
        Answer:`;

    try {
        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "llama3.2:1b",
                prompt: prompt,
                stream: false,
            }),
        });

        const data = await response.json();

        res.json({
            reply: data.response,
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to contact Ollama",
        });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});