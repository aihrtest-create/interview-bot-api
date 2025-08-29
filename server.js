const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Пути к файлам данных
const DATA_DIR = path.join(__dirname, 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const SYSTEM_PROMPT_FILE = path.join(DATA_DIR, 'system_prompt.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

// Инициализация директории данных
async function initializeDataDirectory() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
    
    const defaultFiles = [
        { file: JOBS_FILE, data: [] },
        { file: SYSTEM_PROMPT_FILE, data: { systemPrompt: 'Ты — опытный AI-интервьюер. Проводи собеседование профессионально и задавай релевантные вопросы.' } },
        { file: USERS_FILE, data: {} },
        { file: STATS_FILE, data: { totalJobs: 0, totalUsers: 0, totalInterviews: 0 } }
    ];
    
    for (const { file, data } of defaultFiles) {
        try {
            await fs.access(file);
        } catch {
            await fs.writeFile(file, JSON.stringify(data, null, 2));
        }
    }
}

// Утилиты для работы с файлами
async function readJSONFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
}

async function writeJSONFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error);
        return false;
    }
}

// API Routes

// Системный промпт
app.get('/api/system-prompt', async (req, res) => {
    const data = await readJSONFile(SYSTEM_PROMPT_FILE);
    res.json(data || { systemPrompt: '' });
});

app.post('/api/system-prompt', async (req, res) => {
    const { systemPrompt } = req.body;
    
    if (!systemPrompt) {
        return res.status(400).json({ error: 'System prompt is required' });
    }
    
    const success = await writeJSONFile(SYSTEM_PROMPT_FILE, { systemPrompt });
    
    if (success) {
        res.json({ message: 'System prompt saved successfully' });
    } else {
        res.status(500).json({ error: 'Failed to save system prompt' });
    }
});

// Получение системного промпта для пользователя
app.get('/api/user/:userId/system-prompt', async (req, res) => {
    const systemPromptData = await readJSONFile(SYSTEM_PROMPT_FILE);
    res.json({ systemPrompt: systemPromptData?.systemPrompt || '' });
});

// Вакансии
app.get('/api/jobs', async (req, res) => {
    const jobs = await readJSONFile(JOBS_FILE);
    res.json(jobs || []);
});

app.post('/api/jobs', async (req, res) => {
    const { title, company, description } = req.body;
    
    if (!title || !company || !description) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    const jobs = await readJSONFile(JOBS_FILE) || [];
    
    const newJob = {
        id: Date.now(),
        title,
        company,
        description,
        createdAt: new Date().toISOString(),
        isActive: false
    };
    
    jobs.push(newJob);
    
    const success = await writeJSONFile(JOBS_FILE, jobs);
    
    if (success) {
        res.status(201).json(newJob);
    } else {
        res.status(500).json({ error: 'Failed to save job' });
    }
});

app.post('/api/jobs/:id/activate', async (req, res) => {
    const { id } = req.params;
    const jobs = await readJSONFile(JOBS_FILE) || [];
    
    jobs.forEach(job => job.isActive = false);
    
    const targetJob = jobs.find(job => job.id === parseInt(id));
    if (targetJob) {
        targetJob.isActive = true;
    }
    
    const success = await writeJSONFile(JOBS_FILE, jobs);
    
    if (success) {
        res.json({ message: 'Job activated successfully' });
    } else {
        res.status(500).json({ error: 'Failed to activate job' });
    }
});

app.delete('/api/jobs/:id', async (req, res) => {
    const { id } = req.params;
    const jobs = await readJSONFile(JOBS_FILE) || [];
    
    const filteredJobs = jobs.filter(job => job.id !== parseInt(id));
    
    const success = await writeJSONFile(JOBS_FILE, filteredJobs);
    
    if (success) {
        res.json({ message: 'Job deleted successfully' });
    } else {
        res.status(500).json({ error: 'Failed to delete job' });
    }
});

// Получение активной вакансии
app.get('/api/user/:userId/job-description', async (req, res) => {
    const jobs = await readJSONFile(JOBS_FILE) || [];
    const activeJob = jobs.find(job => job.isActive);
    
    if (activeJob) {
        res.json({ jobDescription: activeJob.description });
    } else {
        res.json({ jobDescription: 'Описание вакансии не найдено. Пожалуйста, активируйте вакансию в административной панели.' });
    }
});

// Управление состоянием интервью
app.get('/api/user/:userId/interview-state', async (req, res) => {
    const { userId } = req.params;
    const users = await readJSONFile(USERS_FILE) || {};
    
    const userState = users[userId] || { interviewActive: false };
    res.json(userState);
});

// Webhooks для n8n
app.post('/webhook/start-interview', async (req, res) => {
    const { userId, userName } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    
    const users = await readJSONFile(USERS_FILE) || {};
    
    if (!users[userId]) {
        users[userId] = { userName };
    }
    
    users[userId].interviewActive = true;
    users[userId].interviewStartTime = new Date().toISOString();
    
    const success = await writeJSONFile(USERS_FILE, users);
    
    if (success) {
        res.json({ message: 'Interview started successfully', interviewActive: true });
    } else {
        res.status(500).json({ error: 'Failed to start interview' });
    }
});

app.post('/webhook/stop-interview', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    
    const users = await readJSONFile(USERS_FILE) || {};
    
    if (!users[userId]) {
        users[userId] = {};
    }
    
    users[userId].interviewActive = false;
    users[userId].interviewEndTime = new Date().toISOString();
    
    const success = await writeJSONFile(USERS_FILE, users);
    
    if (success) {
        res.json({ message: 'Interview stopped successfully', interviewActive: false });
    } else {
        res.status(500).json({ error: 'Failed to stop interview' });
    }
});

app.post('/api/user/:userId/complete-interview', async (req, res) => {
    const { userId } = req.params;
    const users = await readJSONFile(USERS_FILE) || {};
    
    if (!users[userId]) {
        users[userId] = {};
    }
    
    users[userId].interviewActive = false;
    users[userId].interviewEndTime = new Date().toISOString();
    users[userId].completedInterviews = (users[userId].completedInterviews || 0) + 1;
    
    const success = await writeJSONFile(USERS_FILE, users);
    
    if (success) {
        res.json({ message: 'Interview completed successfully' });
    } else {
        res.status(500).json({ error: 'Failed to complete interview' });
    }
});

// Статистика
app.get('/api/stats', async (req, res) => {
    const jobs = await readJSONFile(JOBS_FILE) || [];
    const users = await readJSONFile(USERS_FILE) || {};
    
    const totalJobs = jobs.length;
    const totalUsers = Object.keys(users).length;
    const totalInterviews = Object.values(users).reduce((sum, user) => {
        return sum + (user.completedInterviews || 0);
    }, 0);
    
    res.json({ totalJobs, totalUsers, totalInterviews });
});

// Здоровье API
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.json({ 
        message: 'Interview Bot API Server',
        status: 'Running',
        endpoints: {
            health: '/api/health',
            jobs: '/api/jobs',
            systemPrompt: '/api/system-prompt',
            stats: '/api/stats'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Запуск сервера
async function startServer() {
    try {
        await initializeDataDirectory();
        
        app.listen(PORT, () => {
            console.log(`🚀 Interview Bot API Server running on port ${PORT}`);
            console.log(`📊 Health check: /api/health`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
