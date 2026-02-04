// App State
const state = {
    userId: 'user_123', // Hardcoded for prototype
    currentView: 'dashboard',
    concepts: {
        roots: [],
        unlocked: [],
        progress: {}
    }
};

// DOM Elements
const mainContent = document.getElementById('main-content');
const navLinks = document.querySelectorAll('.nav-link');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initRouter();
});

// Routing
function initRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute(); // Initial load
}

function handleRoute() {
    const hash = window.location.hash || '#dashboard';

    // Update Nav
    navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === hash);
    });

    if (hash === '#dashboard') {
        renderDashboard();
    } else if (hash === '#ingest') {
        renderIngest();
    } else if (hash.startsWith('#lesson/')) {
        const raw = hash.split('#lesson/')[1];
        const concept = decodeURIComponent(raw.split('?')[0]);
        renderLesson(concept);
    } else if (hash.startsWith('#path/')) {
        const raw = hash.split('#path/')[1];
        const concept = decodeURIComponent(raw.split('?')[0]);
        renderPathGenerator(concept);
    }
}

// API Client
const api = {
    async get(endpoint) {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    },
    async post(endpoint, body) {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    }
};

// Views

async function renderDashboard() {
    mainContent.innerHTML = '<div class="loading-spinner">Loading dashboard...</div>';

    try {
        const [roots, progress] = await Promise.all([
            api.get('/api/concepts/roots'),
            api.get(`/api/progress/${state.userId}`)
        ]);

        // Filter out completed roots
        const availableRoots = roots.filter(c => !progress.completed_concepts.includes(c));

        mainContent.innerHTML = `
            <div class="dashboard-header">
                <h1>Welcome Back</h1>
                <p>Continue your learning journey.</p>
            </div>

            <div class="dashboard-grid">
                <!-- Progress Column -->
                <div class="card">
                    <div class="section-header">
                        <h2>Your Progress</h2>
                    </div>
                    ${progress.in_progress_concepts.length === 0 ? '<p class="text-secondary">No active lessons.</p>' : ''}
                    <div class="concept-list">
                        ${progress.in_progress_concepts.map(c => `
                            <div class="concept-item" onclick="window.location.hash='#lesson/${encodeURIComponent(c)}'">
                                <span>${formatConcept(c)}</span>
                                <span class="tag unlocked">In Progress</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <h3 style="margin-top: 2rem;">Completed</h3>
                    <div class="concept-list" style="margin-top: 1rem; opacity: 0.7;">
                        ${progress.completed_concepts.map(c => `
                            <div class="concept-item">
                                <span>${formatConcept(c)}</span>
                                <span class="tag completed">Done</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Available Column -->
                <div class="card">
                    <div class="section-header">
                        <h2>Available to Learn</h2>
                    </div>
                    <div class="concept-list">
                        ${progress.available_concepts.map(c => `
                            <div class="concept-item" onclick="window.location.hash='#path/${encodeURIComponent(c)}'">
                                <span>${formatConcept(c)}</span>
                                <span class="tag unlocked">Unlocked</span>
                            </div>
                        `).join('')}
                         ${availableRoots.map(c => `
                            <div class="concept-item" onclick="window.location.hash='#path/${encodeURIComponent(c)}'">
                                <span>${formatConcept(c)}</span>
                                <span class="tag root">Root</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        mainContent.innerHTML = `<div class="error">Failed to load dashboard: ${err.message}</div>`;
    }
}

async function renderPathGenerator(targetConcept) {
    mainContent.innerHTML = `
        <div class="card" style="max-width: 600px; margin: 4rem auto; text-align: center;">
            <h2>Create Learning Path</h2>
            <p style="margin-bottom: 2rem; color: var(--text-secondary);">Target: <strong>${formatConcept(targetConcept)}</strong></p>
            
            <div style="margin-bottom: 2rem;">
                <label style="display: block; margin-bottom: 0.5rem;">Time Budget (minutes)</label>
                <input type="number" id="timeBudget" value="30" style="padding: 0.5rem; border-radius: 0.5rem; border: 1px solid var(--border-color); background: var(--bg-secondary); color: white; width: 100px; text-align: center;">
            </div>

            <button class="btn" onclick="generatePath('${targetConcept}')">Generate Path</button>
        </div>
    `;
}

async function generatePath(targetConcept) {
    const timeBudget = document.getElementById('timeBudget').value;
    const btn = document.querySelector('.btn');
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
        const path = await api.post('/api/ai/learning-path', {
            user_id: state.userId,
            target_concept: targetConcept,
            time_budget_minutes: parseInt(timeBudget)
        });

        // Navigate to the lesson of the first concept in the path (or the target itself if path is short)
        // For simplicity, let's just go to the target lesson, the API handles the full content retrieval
        window.location.hash = `#lesson/${encodeURIComponent(targetConcept)}?time=${timeBudget}`;

    } catch (err) {
        alert('Failed to generate path: ' + err.message);
        btn.textContent = 'Generate Path';
        btn.disabled = false;
    }
}

async function renderLesson(concept) {
    // Check for query param for time budget
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const timeBudget = params.get('time') || 30;

    mainContent.innerHTML = '<div class="loading-spinner">Loading lesson content...</div>';

    try {
        // Try to mark progress as started (may fail if prerequisites not met, but continue anyway)
        try {
            await api.post('/api/progress/start', {
                user_id: state.userId,
                concept_name: concept
            });
        } catch (progressErr) {
            console.log('Could not mark progress started:', progressErr.message);
            // Continue loading the lesson anyway
        }

        const lesson = await api.get(`/api/learning/lesson/${state.userId}/${encodeURIComponent(concept)}?time_budget=${timeBudget}`);

        // Configure marked
        marked.use({
            gfm: true,
            breaks: false // Disable breaks to let text reflow naturally
        });

        // Convert Markdown to HTML using marked.js and sanitize with DOMPurify
        const htmlContent = DOMPurify.sanitize(marked.parse(lesson.content_markdown));

        // Build flashcards section if flashcards exist
        const flashcardsHtml = lesson.flashcards && lesson.flashcards.length > 0 ? `
            <div class="flashcards-section" style="margin-top: 3rem;">
                <div class="section-header">
                    <h2>Review Flashcards</h2>
                    <span class="tag unlocked">${lesson.flashcards.length} cards</span>
                </div>
                <div class="flashcard-slider" id="flashcardSlider">
                    <div class="flashcard-container">
                        ${lesson.flashcards.map((card, idx) => `
                            <div class="flashcard" data-index="${idx}" style="display: ${idx === 0 ? 'block' : 'none'}">
                                <div class="flashcard-inner" onclick="flipCard(this)">
                                    <div class="flashcard-front">
                                        <span class="card-label">Question ${idx + 1}/${lesson.flashcards.length}</span>
                                        <p>${DOMPurify.sanitize(card.front)}</p>
                                        <span class="flip-hint">Click to flip</span>
                                    </div>
                                    <div class="flashcard-back">
                                        <span class="card-label">Answer</span>
                                        <p>${DOMPurify.sanitize(card.back)}</p>
                                        <span class="flip-hint">Click to flip</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="flashcard-nav" style="display: flex; justify-content: center; gap: 1rem; margin-top: 1rem;">
                        <button class="btn btn-secondary" onclick="prevCard()">Previous</button>
                        <span id="cardCounter" style="line-height: 2.5rem;">1 / ${lesson.flashcards.length}</span>
                        <button class="btn btn-secondary" onclick="nextCard()">Next</button>
                    </div>
                </div>
            </div>
        ` : '';

        mainContent.innerHTML = `
            <div class="lesson-container">
                <div class="path-stepper">
                    ${lesson.path.map(step => `
                        <div class="step ${step === concept ? 'active' : ''}">${formatConcept(step)}</div>
                    `).join('')}
                </div>

                <div class="section-header">
                    <h1>${formatConcept(lesson.target)}</h1>
                    <span class="tag unlocked">${lesson.estimated_time} min</span>
                </div>

                <div class="lesson-content">
                    ${htmlContent}
                </div>

                ${flashcardsHtml}

                <div style="margin-top: 3rem; text-align: center; display: flex; gap: 1rem; justify-content: center;">
                    <button class="btn btn-secondary" onclick="window.location.hash='#dashboard'">Back to Dashboard</button>
                    <button class="btn" onclick="completeLesson('${concept}')">Complete Lesson</button>
                </div>
            </div>
        `;

        // Initialize flashcard state
        if (lesson.flashcards && lesson.flashcards.length > 0) {
            window.currentCardIndex = 0;
            window.totalCards = lesson.flashcards.length;
        }
    } catch (err) {
        mainContent.innerHTML = `<div class="error">Failed to load lesson: ${err.message}</div>`;
    }
}

// Flashcard navigation functions
function flipCard(element) {
    element.classList.toggle('flipped');
}

function showCard(index) {
    const cards = document.querySelectorAll('.flashcard');
    cards.forEach((card, idx) => {
        card.style.display = idx === index ? 'block' : 'none';
        // Reset flip state when switching cards
        const inner = card.querySelector('.flashcard-inner');
        if (inner) inner.classList.remove('flipped');
    });
    document.getElementById('cardCounter').textContent = `${index + 1} / ${window.totalCards}`;
}

function nextCard() {
    if (window.currentCardIndex < window.totalCards - 1) {
        window.currentCardIndex++;
        showCard(window.currentCardIndex);
    }
}

function prevCard() {
    if (window.currentCardIndex > 0) {
        window.currentCardIndex--;
        showCard(window.currentCardIndex);
    }
}

async function completeLesson(concept) {
    try {
        await api.post('/api/progress/complete', {
            user_id: state.userId,
            concept_name: concept
        });
        window.location.hash = '#dashboard';
    } catch (err) {
        alert('Failed to complete lesson: ' + err.message);
    }
}

async function renderIngest() {
    mainContent.innerHTML = `
        <div class="card" style="max-width: 800px; margin: 4rem auto;">
            <h2>Ingest Documents</h2>
            <p style="margin-bottom: 2rem; color: var(--text-secondary);">Upload PDF or DOCX files to expand the knowledge graph.</p>
            
            <div class="upload-zone" onclick="document.getElementById('fileInput').click()">
                <p>Click to upload local file</p>
                <input type="file" id="fileInput" style="display: none" onchange="handleFileUpload(this)">
            </div>
            
            <div style="margin-top: 2rem; display: flex; gap: 0.5rem;">
                <input type="text" id="youtubeUrl" placeholder="Paste YouTube URL here" style="flex: 1; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid var(--border-color); background: var(--bg-secondary); color: white;">
                <button class="btn" onclick="handleYouTubeIngest()">Ingest YouTube</button>
            </div>

            <div id="uploadStatus" style="margin-top: 1rem; text-align: center;"></div>

            <div class="document-section" style="margin-top: 4rem;">
                <h3>Managed Documents</h3>
                <div id="documentsList" class="loading-spinner">Loading documents...</div>
            </div>
        </div>
    `;
    loadDocuments();
}

async function loadDocuments() {
    const listEl = document.getElementById('documentsList');
    try {
        const docs = await api.get('/api/documents');
        if (docs.length === 0) {
            listEl.innerHTML = '<p class="text-secondary">No documents ingested yet.</p>';
            return;
        }

        listEl.innerHTML = `
            <table class="doc-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Upload Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${docs.map(doc => `
                        <tr>
                            <td>${doc.title || doc.filename || 'Untitled'}</td>
                            <td>${new Date(doc.upload_date).toLocaleDateString()}</td>
                            <td><span class="tag ${doc.status === 'completed' ? 'unlocked' : 'root'}">${doc.status || 'pending'}</span></td>
                            <td>
                                <div style="display: flex; gap: 0.5rem;">
                                    <a href="/api/documents/${doc.id}/download" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Download</a>
                                    <button onclick="deleteDocument(${doc.id})" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; border-color: #ef4444; color: #ef4444;">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        listEl.innerHTML = `<div class="error">Failed to load documents: ${err.message}</div>`;
    }
}

async function deleteDocument(id) {
    try {
        const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        loadDocuments();
    } catch (err) {
        alert('Failed to delete document: ' + err.message);
    }
}

async function handleFileUpload(input) {
    if (!input.files.length) return;
    const file = input.files[0];
    const status = document.getElementById('uploadStatus');

    status.innerHTML = '<span style="color: var(--accent-primary)">Uploading and processing... This may take a while.</span>';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name); // Add required title field

    try {
        const res = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(errorData.detail || res.statusText);
        }
        const data = await res.json();

        status.innerHTML = `<span style="color: var(--success)">Success! Document uploaded and processing started.</span>`;
        loadDocuments(); // Refresh list
    } catch (err) {
        status.innerHTML = `<span style="color: var(--warning)">Error: ${err.message}</span>`;
    }
}

async function handleYouTubeIngest() {
    const urlInput = document.getElementById('youtubeUrl');
    const url = urlInput.value.trim();
    if (!url) return;

    const status = document.getElementById('uploadStatus');
    status.innerHTML = '<span style="color: var(--accent-primary)">Fetching transcript and processing... This may take a while.</span>';

    try {
        const res = await fetch('/api/documents/youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || res.statusText);
        }

        const data = await res.json();
        status.innerHTML = `<span style="color: var(--success)">Success! ${data.message}</span>`;
        urlInput.value = '';
        loadDocuments(); // Refresh list
    } catch (err) {
        status.innerHTML = `<span style="color: var(--warning)">Error: ${err.message}</span>`;
    }
}

// Helpers
function formatConcept(name) {
    return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}


