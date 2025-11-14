const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// Serve static frontend files (so ide.html is available at /ide.html)
app.use(express.static(__dirname));

// Serve ide.html at root path (/) so the IDE loads automatically
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ide.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Temporary directory for code files
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure temp directory exists
(async () => {
    try {
        await fs.mkdir(TEMP_DIR);
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
})();

// Helper function to create and execute a file
async function executeCode(code, extension, command) {
    const filename = `temp_${Date.now()}${extension}`;
    const filepath = path.join(TEMP_DIR, filename);
    
    try {
        await fs.writeFile(filepath, code);
        
        return new Promise((resolve, reject) => {
            exec(command(filepath), { timeout: 5000 }, (error, stdout, stderr) => {
                fs.unlink(filepath).catch(console.error); // Cleanup
                
                if (error && error.killed) {
                    reject('Execution timed out');
                }
                
                resolve({ stdout, stderr });
            });
        });
    } catch (err) {
        throw err;
    }
}

// Python endpoint
app.post('/run/python', async (req, res) => {
    try {
        const result = await executeCode(
            req.body.code,
            '.py',
            (filepath) => `python "${filepath}"`
        );
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// Java endpoint
app.post('/run/java', async (req, res) => {
    try {
        // Extract class name from code
        const className = req.body.code.match(/public\s+class\s+(\w+)/)?.[1] || 'Main';
        const result = await executeCode(
            req.body.code,
            '.java',
            (filepath) => `javac "${filepath}" && java -cp "${path.dirname(filepath)}" ${className}`
        );
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// C++ endpoint
app.post('/run/cpp', async (req, res) => {
    try {
        // Check if g++ is available
        try {
            await new Promise((resolve, reject) => {
                exec('g++ --version', (error) => {
                    if (error) {
                        reject(new Error('C++ compiler (g++) is not installed. Please install MinGW-w64 and add it to your PATH.'));
                    }
                    resolve();
                });
            });
        } catch (error) {
            return res.status(500).json({
                error: error.message,
                instructions: `To install g++ on Windows:
1. Download MinGW-w64 from: https://github.com/msys2/msys2-installer/releases/
2. Install MSYS2
3. Open MSYS2 terminal and run: pacman -S mingw-w64-x86_64-gcc
4. Add to PATH: C:\\msys64\\mingw64\\bin
5. Restart your terminal/IDE`
            });
        }

        const result = await executeCode(
            req.body.code,
            '.cpp',
            (filepath) => `g++ "${filepath}" -o "${filepath}.exe" && "${filepath}.exe"`
        );
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.listen(PORT, () => {
    console.log(`✨ Server running on http://localhost:${PORT}`);
    console.log(`🚀 Open http://localhost:${PORT}/ in your browser to start coding!`);
});