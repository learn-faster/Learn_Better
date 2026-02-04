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
        <div class="card" style="max-width: 800px; margin: 4rem auto; text-align: center;">
            <h2>Create Learning Path</h2>
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">Target: <strong>${formatConcept(targetConcept)}</strong></p>
            
            <div id="cognitive-map" class="graph-container">
                <div class="loading-spinner" style="margin-top: 150px;">Loading frontier map...</div>
            </div>

            <div style="margin-bottom: 2rem; padding: 0 2rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <label>Time Budget</label>
                    <span id="timeValue" style="color: var(--accent-primary); font-weight: bold;">30 min</span>
                </div>
                <input type="range" id="timeBudget" min="0" max="60" value="30" style="width: 100%; cursor: pointer;" 
                    oninput="document.getElementById('timeValue').innerText = this.value + ' min'; updateGraphHighlights(this.value)">
            </div>

            <button class="btn" onclick="generatePath('${targetConcept}')">Generate Path</button>
        </div>
    `;

    renderCognitiveMap('cognitive-map', targetConcept);
}

async function renderCognitiveMap(containerId, targetConcept) {
    const container = document.getElementById(containerId);

    try {
        const [data, progress] = await Promise.all([
            api.get(`/api/concepts/neighborhood/${encodeURIComponent(targetConcept)}`),
            api.get(`/api/progress/${state.userId}`)
        ]);

        if (data.nodes.length === 0) {
            container.innerHTML = '<div style="margin-top: 150px; color: var(--text-secondary);">No graph data available for this concept.</div>';
            return;
        }

        container.innerHTML = ''; // Clear loading

        const width = container.clientWidth;
        const height = container.clientHeight;

        const svg = d3.select(`#${containerId}`)
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Arrowhead definition
        svg.append("defs").append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "-0 -5 10 10")
            .attr("refX", 18) // Adjusted for node radius
            .attr("refY", 0)
            .attr("orient", "auto")
            .attr("markerWidth", 8)
            .attr("markerHeight", 8)
            .attr("xoverflow", "visible")
            .append("svg:path")
            .attr("d", "M 0,-5 L 10 ,0 L 0,5")
            .attr("fill", "var(--border-color)")
            .style("stroke", "none");

        const simulation = d3.forceSimulation(data.nodes)
            .force("link", d3.forceLink(data.edges).id(d => d.id).distance(120))
            .force("charge", d3.forceManyBody().strength(-400))
            .force("center", d3.forceCenter(width / 2, height / 2));

        const link = svg.append("g")
            .selectAll("line")
            .data(data.edges)
            .join("line")
            .attr("class", "link");

        const node = svg.append("g")
            .selectAll("g")
            .data(data.nodes)
            .join("g")
            .attr("class", d => {
                let cls = `node ${d.group}`;
                if (progress.completed_concepts.includes(d.id)) cls += " completed";
                else if (d.id !== targetConcept && !progress.available_concepts.includes(d.id)) cls += " locked";
                return cls;
            })
            .on("click", (event, d) => {
                if (d.id !== targetConcept) {
                    renderPathGenerator(d.id); // Switch target
                }
            })
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        node.append("circle");

        // Add markers with background pills
        const markers = [
            { group: 'prerequisite', text: 'START', color: 'var(--warning)' },
            { group: 'target', text: 'GOAL', color: 'var(--accent-primary)' },
            { group: 'dependent', text: 'NEXT', color: 'var(--success)' }
        ];

        markers.forEach(m => {
            const selection = node.filter(d => d.group === m.group);

            selection.append("rect")
                .attr("class", "badge-bg")
                .attr("x", -20)
                .attr("y", -32)
                .attr("width", 40)
                .attr("height", 14)
                .style("stroke", m.color);

            selection.append("text")
                .attr("class", "badge")
                .attr("dy", -22)
                .text(m.text);
        });

        node.append("text")
            .attr("dy", 30)
            .text(d => formatConcept(d.id));

        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("transform", d => `translate(${d.x},${d.y})`);
        });

        // Store for dynamic updates
        window.currentMap = { node, targetConcept, userId: state.userId };

        // Initial highlight
        updateGraphHighlights(document.getElementById('timeBudget').value);

        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div style="margin-top: 150px; color: var(--warning);">Error: ${err.message}</div>`;
    }
}

let highlightTimeout;
function updateGraphHighlights(value) {
    if (!window.currentMap) return;

    // Debounce API calls
    clearTimeout(highlightTimeout);
    highlightTimeout = setTimeout(async () => {
        try {
            const { targetConcept, userId, node } = window.currentMap;
            const preview = await api.get(`/api/learning/path-preview?user_id=${userId}&target_concept=${encodeURIComponent(targetConcept)}&time_budget=${value}`);

            // Update node classes
            node.classed("in-path", d => preview.concepts.includes(d.id));

            // Update GOAL label if pruned
            if (preview.is_pruned && preview.concepts.length > 0) {
                const newGoal = preview.concepts[preview.concepts.length - 1];
                document.getElementById('timeValue').innerHTML = `${value} min <span style="font-size: 0.8rem; opacity: 0.7;">(Limited to ${formatConcept(newGoal)})</span>`;
            } else {
                document.getElementById('timeValue').innerHTML = `${value} min`;
            }
        } catch (err) {
            console.warn("Failed to update highlights:", err);
        }
    }, 150);
}

async function generatePath(targetConcept) {
    const timeBudget = document.getElementById('timeBudget').value;
    const btn = document.querySelector('.btn');
    const originalText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
        const path = await api.post('/api/ai/learning-path', {
            user_id: state.userId,
            target_concept: targetConcept,
            time_budget_minutes: parseInt(timeBudget)
        });

        if (!path.concepts || path.concepts.length === 0) {
            alert(`Budget too low! Your current budget of ${timeBudget} min isn't enough to start "${formatConcept(targetConcept)}". Try increasing the time or picking a simpler concept.`);
            btn.textContent = originalText;
            btn.disabled = false;
            return;
        }

        // If path was pruned, inform the user they are learning a sub-goal
        if (path.pruned && path.target_concept !== targetConcept) {
            const proceed = confirm(`Total path to "${formatConcept(targetConcept)}" exceeds ${timeBudget} min. \n\nWe've created a shorter path to "${formatConcept(path.target_concept)}" instead. Proceed?`);
            if (!proceed) {
                btn.textContent = originalText;
                btn.disabled = false;
                return;
            }
        }

        window.location.hash = `#lesson/${encodeURIComponent(path.target_concept)}?time=${timeBudget}`;

    } catch (err) {
        alert('Failed to generate path: ' + err.message);
        btn.textContent = originalText;
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

        // Pre-process Markdown: Double-escape LaTeX delimiters so 'marked' doesn't eat the backslashes
        // \[ -> \\[ , \] -> \\] , \( -> \\( , \) -> \\)
        const protectedMarkdown = lesson.content_markdown
            .replace(/\\\[/g, '\\\\[')
            .replace(/\\\]/g, '\\\\]')
            .replace(/\\\(/g, '\\\\(')
            .replace(/\\\)/g, '\\\\)');

        // Convert Markdown to HTML using marked.js
        const htmlContent = marked.parse(protectedMarkdown);

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
                    <button class="btn" onclick='completeLesson(${JSON.stringify(lesson.path)})'>Complete Lesson</button>
                </div>
            </div>
        `;

        // Render Math
        if (window.renderMathInElement) {
            renderMathInElement(mainContent, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }
    } catch (err) {
        mainContent.innerHTML = `<div class="error">Failed to load lesson: ${err.message}</div>`;
    }
}

async function completeLesson(concepts) {
    if (!Array.isArray(concepts)) concepts = [concepts];

    try {
        // Mark each concept in the path as completed
        for (const concept of concepts) {
            await api.post('/api/progress/complete', {
                user_id: state.userId,
                concept_name: concept
            });
        }
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


